import { prisma } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../errors";
import { BillingMode, OrderStatus, UserRole } from "@/generated/prisma/enums";
import { scopeToOwnPortfolio, type SessionUser } from "../guards";
import { lockKey } from "../locks";
import {
  AGING_LABEL,
  collectionPriority,
  isBlockedForPayment,
  paymentStatusFor,
  summarizeClient,
  type AgingBucket,
} from "@/lib/receivables";
import { PAYMENT_BLOCK_LABEL } from "@/lib/labels";
import type { CollectionUpdateInput, PaymentCreateInput, ReceivablesQuery } from "../validators/payments";

/**
 * Cartera y pagos.
 *
 * Un pedido ENTREGADO con saldo es cartera. El saldo es el total menos la
 * suma de sus pagos, y `Order.paymentStatus` se recalcula con cada pago: no se
 * escribe a mano, así no puede contradecir lo cobrado.
 */

/** Meses hacia atrás desde `now`, para el filtro de entregas recientes. */
function monthsAgo(now: Date, months: number): Date {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

/** Clientes con saldo, del más vencido al menos. Un VENDEDOR ve su cartera. */
export async function listReceivables(
  user: SessionUser,
  query: ReceivablesQuery,
  now: Date = new Date(),
) {
  const orders = await prisma.order.findMany({
    where: {
      status: OrderStatus.ENTREGADO,
      deliveredAt: query.months ? { gte: monthsAgo(now, query.months) } : { not: null },
      // Un pedido pagado no tiene saldo: se descarta en la consulta en vez de
      // traer todo el histórico. `paymentStatus` se recalcula con cada pago.
      paymentStatus: { not: "PAGADO" },
      client: {
        ...scopeToOwnPortfolio(user),
        ...(query.ownerId && user.role !== UserRole.VENDEDOR ? { ownerId: query.ownerId } : {}),
        ...(query.clientType ? { type: query.clientType } : {}),
        ...(query.collectionStatus ? { collectionStatus: query.collectionStatus } : {}),
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
          type: true,
          billingMode: true,
          isSuperDistributor: true,
          collectionStatus: true,
          collectionNote: true,
          creditLimit: true,
          owner: { select: { id: true, name: true } },
          contacts: {
            where: { active: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { firstName: true, lastName: true, phone: true, whatsapp: true },
          },
          addresses: {
            where: { active: true },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { locality: true },
          },
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
      const contact = client.contacts[0];
      const oldest = summary.orders.reduce<Date | null>(
        (min, order) => (min === null || order.deliveredAt < min ? order.deliveredAt : min),
        null,
      );
      const isRemission = client.billingMode === BillingMode.REMISION;

      return {
        clientId: client.id,
        name: client.tradeName ?? client.businessName,
        phone: client.phone,
        owner: client.owner,
        type: client.type,
        isSuperDistributor: client.isSuperDistributor,
        collectionStatus: client.collectionStatus,
        collectionNote: client.collectionNote,
        contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null,
        mobile: contact?.whatsapp ?? contact?.phone ?? client.phone,
        locality: client.addresses[0]?.locality ?? null,
        pendingCount: summary.orders.length,
        /** Saldo en remisiones y en facturas, según cómo se documenta al cliente. */
        remissionBalance: isRemission ? summary.balance : 0,
        invoiceBalance: isRemission ? 0 : summary.balance,
        oldestDeliveredAt: oldest,
        priority: collectionPriority(summary.maxOverdueDays),
        blocked: isBlockedForPayment(summary.maxOverdueDays),
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

  const sum = (rows: typeof clients, pick: (c: (typeof clients)[number]) => number) =>
    rows.reduce((total, client) => total + pick(client), 0);
  const team = clients.filter((client) => !client.isSuperDistributor);
  const supers = clients.filter((client) => client.isSuperDistributor);

  return {
    clients,
    totals: {
      balance: sum(clients, (c) => c.balance),
      overdue: sum(clients, (c) => c.overdue),
      clientCount: clients.length,
    },
    /** Las cuatro tarjetas del encabezado: valor y número de clientes. */
    cards: {
      total: { amount: sum(clients, (c) => c.balance), clients: clients.length },
      superDistributors: { amount: sum(supers, (c) => c.balance), clients: supers.length },
      teamRemissions: {
        amount: sum(team, (c) => c.remissionBalance),
        clients: team.filter((c) => c.remissionBalance > 0).length,
      },
      teamInvoices: {
        amount: sum(team, (c) => c.invoiceBalance),
        clients: team.filter((c) => c.invoiceBalance > 0).length,
      },
    },
    aging: (["AL_DIA", "1_30", "31_60", "MAS_60"] as const).map((bucket) => ({
      bucket,
      label: AGING_LABEL[bucket],
      amount: aging.get(bucket) ?? 0,
    })),
  };
}

/** Mayor atraso, en días, entre los pedidos entregados con saldo de un cliente. */
export async function clientMaxOverdueDays(clientId: string, now: Date = new Date()): Promise<number> {
  const orders = await prisma.order.findMany({
    where: {
      clientId,
      status: OrderStatus.ENTREGADO,
      deliveredAt: { not: null },
      paymentStatus: { not: "PAGADO" },
    },
    select: {
      id: true,
      total: true,
      deliveredAt: true,
      paymentTerms: true,
      payments: { select: { amount: true } },
    },
  });

  return summarizeClient(
    orders.map((order) => ({
      id: order.id,
      total: Number(order.total),
      paid: order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      deliveredAt: order.deliveredAt!,
      terms: order.paymentTerms,
    })),
    now,
  ).maxOverdueDays;
}

/**
 * Un cliente con mora crítica no recibe cotizaciones nuevas. Un ADMIN puede
 * saltarse el bloqueo (por ejemplo, tras un acuerdo de pago).
 */
export async function assertClientNotBlocked(user: SessionUser, clientId: string, now: Date = new Date()) {
  if (user.role === UserRole.ADMIN) return;
  const days = await clientMaxOverdueDays(clientId, now);
  if (isBlockedForPayment(days)) {
    throw new BusinessRuleError(
      `${PAYMENT_BLOCK_LABEL}: tiene ${days} días de mora. Un administrador puede autorizar la cotización.`,
    );
  }
}

/** Estado y observaciones de cobro de un cliente. */
export async function updateCollection(user: SessionUser, clientId: string, input: CollectionUpdateInput) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...scopeToOwnPortfolio(user) },
    select: { id: true },
  });
  if (!client) throw new NotFoundError("El cliente");

  return prisma.client.update({
    where: { id: clientId },
    data: {
      collectionStatus: input.collectionStatus,
      ...(input.collectionNote !== undefined ? { collectionNote: input.collectionNote } : {}),
    },
    select: { id: true, collectionStatus: true, collectionNote: true },
  });
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
      receivedBy: payment.receivedBy,
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
      receivedBy: input.receivedBy,
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

/**
 * Saldo pendiente por responsable del cliente, de toda la cartera. Es una
 * cifra de gestión que ve todo el equipo comercial, así que no se limita a la
 * cartera propia como `listReceivables`.
 */
export async function receivableBalanceByOwner(now: Date = new Date()): Promise<Map<string | null, number>> {
  const all = await listReceivables(
    { id: "", name: "", email: "", role: UserRole.ADMIN },
    { overdueOnly: false },
    now,
  );

  const byOwner = new Map<string | null, number>();
  for (const client of all.clients) {
    const key = client.owner?.id ?? null;
    byOwner.set(key, (byOwner.get(key) ?? 0) + client.balance);
  }
  return byOwner;
}
