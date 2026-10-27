import { prisma } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../errors";
import { OrderStatus, UserRole } from "@/generated/prisma/enums";
import { scopeToOwnPortfolio, type SessionUser } from "../guards";
import { lockKey } from "../locks";
import {
  AGING_LABEL,
  paymentStatusFor,
  summarizeClient,
  type AgingBucket,
} from "@/lib/receivables";
import type { PaymentCreateInput, ReceivablesQuery } from "../validators/payments";

/**
 * Cartera y pagos.
 *
 * Un pedido ENTREGADO con saldo es cartera. El saldo es el total menos la
 * suma de sus pagos, y `Order.paymentStatus` se recalcula con cada pago: no se
 * escribe a mano, así no puede contradecir lo cobrado.
 */

/** Clientes con saldo, del más vencido al menos. Un VENDEDOR ve su cartera. */
export async function listReceivables(
  user: SessionUser,
  query: ReceivablesQuery,
  now: Date = new Date(),
) {
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.ENTREGADO,
      deliveredAt: { not: null },
      // Un pedido pagado no tiene saldo: se descarta en la consulta en vez de
      // traer todo el histórico. `paymentStatus` se recalcula con cada pago.
      paymentStatus: { not: "PAGADO" },
      client: {
        ...scopeToOwnPortfolio(user),
        ...(query.ownerId && user.role !== UserRole.VENDEDOR ? { ownerId: query.ownerId } : {}),
        ...(query.search
          ? {
              OR: [
                { businessName: { contains: query.search, mode: "insensitive" as const } },
                { tradeName: { contains: query.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      deliveredAt: true,
      paymentTerms: true,
      payments: { select: { amount: true } },
      client: {
        select: {
          id: true,
          businessName: true,
          tradeName: true,
          phone: true,
          creditLimit: true,
          owner: { select: { id: true, name: true } },
        },
      },
    },
  });

  const byClient = new Map<string, { client: (typeof orders)[number]["client"]; orders: typeof orders }>();
  for (const order of orders) {
    const entry = byClient.get(order.client.id) ?? { client: order.client, orders: [] };
    entry.orders.push(order);
    byClient.set(order.client.id, entry);
  }

  const orderNumber = new Map(orders.map((order) => [order.id, order.orderNumber]));

  const clients = [...byClient.values()]
    .map(({ client, orders: clientOrders }) => {
      const summary = summarizeClient(
        clientOrders.map((order) => ({
          id: order.id,
          total: Number(order.total),
          paid: order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
          deliveredAt: order.deliveredAt!,
          terms: order.paymentTerms,
        })),
        now,
      );

      const creditLimit = Number(client.creditLimit);

      return {
        clientId: client.id,
        name: client.tradeName ?? client.businessName,
        phone: client.phone,
        owner: client.owner,
        creditLimit,
        // Si debe más que su cupo aprobado, conviene frenar nuevos pedidos a crédito.
        overCreditLimit: creditLimit > 0 && summary.balance > creditLimit,
        ...summary,
        orders: summary.orders.map((order) => ({
          ...order,
          orderNumber: orderNumber.get(order.id)!,
        })),
      };
    })
    .filter((client) => client.balance > 0 && (!query.overdueOnly || client.overdue > 0))
    .sort((a, b) => b.maxOverdueDays - a.maxOverdueDays || b.balance - a.balance);

  const aging = new Map<AgingBucket, number>();
  for (const client of clients) {
    for (const order of client.orders) {
      aging.set(order.bucket, (aging.get(order.bucket) ?? 0) + order.balance);
    }
  }

  return {
    clients,
    totals: {
      balance: clients.reduce((sum, client) => sum + client.balance, 0),
      overdue: clients.reduce((sum, client) => sum + client.overdue, 0),
      clientCount: clients.length,
    },
    aging: (["AL_DIA", "1_30", "31_60", "MAS_60"] as const).map((bucket) => ({
      bucket,
      label: AGING_LABEL[bucket],
      amount: aging.get(bucket) ?? 0,
    })),
  };
}

/** Pagos de un pedido, del más reciente al más antiguo, con el saldo vigente. */
export async function getOrderPayments(user: SessionUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      sellerId: true,
      payments: {
        orderBy: { paidAt: "desc" },
        include: { user: { select: { name: true } } },
      },
    },
  });

  if (!order) throw new NotFoundError("El pedido");
  if (user.role === UserRole.VENDEDOR && order.sellerId !== user.id) {
    throw new ForbiddenError("Este pedido no es tuyo.");
  }

  const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

  return {
    total: Number(order.total),
    paid,
    balance: Math.round(Number(order.total) - paid),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
      reference: payment.reference,
      registeredBy: payment.user?.name ?? null,
    })),
  };
}

/**
 * Registra un pago. Bajo candado del pedido para que dos cobros simultáneos
 * no se pasen del saldo; no admite pagar de más ni pedidos cancelados o sin
 * confirmar.
 */
export async function registerPayment(
  user: SessionUser,
  orderId: string,
  input: PaymentCreateInput,
) {
  return prisma.$transaction((tx) => recordPayment(tx, user, orderId, input));
}

/**
 * El cobro en sí, dentro de una transacción ajena: así la entrega puede
 * registrarse y cobrarse como una sola operación (o ninguna).
 */
export async function recordPayment(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  orderId: string,
  input: PaymentCreateInput,
) {
  await lockKey(tx, `order-payment:${orderId}`);

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      status: true,
      sellerId: true,
      payments: { select: { amount: true } },
    },
  });

  if (!order) throw new NotFoundError("El pedido");
  if (user.role === UserRole.VENDEDOR && order.sellerId !== user.id) {
    throw new ForbiddenError("Este pedido no es tuyo.");
  }
  if (order.status === OrderStatus.CANCELADO || order.status === OrderStatus.BORRADOR) {
    throw new BusinessRuleError("Este pedido no admite pagos: está cancelado o sin confirmar.");
  }

  const total = Number(order.total);
  const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balance = Math.round(total - paid);

  if (input.amount > balance) {
    throw new BusinessRuleError(
      `El pago supera el saldo del pedido (saldo: ${balance.toLocaleString("es-CO")}).`,
      { balance },
    );
  }

  const payment = await tx.payment.create({
    data: {
      orderId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt ?? new Date(),
      reference: input.reference,
      userId: user.id,
    },
  });

  await tx.order.update({
    where: { id: orderId },
    data: { paymentStatus: paymentStatusFor(total, paid + input.amount) },
  });

  return { payment, balance: Math.round(balance - input.amount) };
}
