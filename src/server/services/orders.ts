import { prisma } from "../db";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../errors";
import { UserRole, OrderStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { buildPriceResolver } from "./pricing";
import { allocateStockForOrder, returnStockForOrder } from "./inventory";
import { canTransition, computeOrderTotals } from "@/lib/order-math";
import type {
  OrderCreateInput,
  OrderListQuery,
  OrderStatusChangeInput,
  OrderUpdateInput,
} from "../validators/orders";

/**
 * Pedidos: cálculo de totales y ciclo de vida.
 *
 * Los importes se calculan SIEMPRE aquí, nunca en el navegador: el cliente
 * envía qué y cuánto, el servidor decide a qué precio. Los precios se resuelven
 * desde la lista del cliente y se congelan en el pedido como snapshot.
 */

// ─────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────

function orderScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
}

function assertCanAccess(user: SessionUser, sellerId: string | null) {
  if (user.role === UserRole.VENDEDOR && sellerId !== user.id) {
    throw new ForbiddenError("Este pedido no es tuyo.");
  }
}

export async function listOrders(user: SessionUser, query: OrderListQuery) {
  const { search, status, paymentStatus, clientId, sellerId, routeId, from, to, page, pageSize } =
    query;

  const where = {
    ...orderScope(user),
    ...(status ? { status } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(clientId ? { clientId } : {}),
    ...(routeId ? { routeId } : {}),
    ...(sellerId && user.role !== UserRole.VENDEDOR ? { sellerId } : {}),
    ...(from || to
      ? { orderDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(search
      ? {
          client: {
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { tradeName: { contains: search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        channel: true,
        orderDate: true,
        requestedDeliveryDate: true,
        total: true,
        client: { select: { id: true, businessName: true, tradeName: true } },
        seller: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOrder(user: SessionUser, id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          sequence: true,
          businessName: true,
          tradeName: true,
          nit: true,
          nitDv: true,
          phone: true,
          contacts: {
            where: { isPrimary: true, active: true },
            take: 1,
            select: { firstName: true, lastName: true, whatsapp: true, phone: true },
          },
        },
      },
      address: { include: { zone: { select: { id: true, name: true } } } },
      seller: { select: { id: true, name: true } },
      route: { select: { id: true, name: true, date: true, status: true } },
      items: {
        orderBy: { productNameSnapshot: "asc" },
        include: { variant: { select: { id: true, sku: true } } },
      },
      proof: true,
      movements: {
        orderBy: { createdAt: "asc" },
        include: { lot: { select: { lotCode: true, expiryDate: true } } },
      },
    },
  });

  if (!order) throw new NotFoundError("El pedido");
  assertCanAccess(user, order.sellerId);

  return order;
}

// ─────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────

/**
 * Resuelve precios e impuestos de las líneas y devuelve los datos listos para
 * persistir, con snapshot del producto tal como se vendió.
 */
async function buildOrderItems(
  clientPriceListId: string | null,
  items: OrderCreateInput["items"],
) {
  const variantIds = items.map((item) => item.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, active: true },
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true, taxRate: true, active: true } },
    },
  });

  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const resolver = await buildPriceResolver(variantIds, clientPriceListId);

  const prepared = items.map((item) => {
    const variant = variantById.get(item.variantId);
    if (!variant || !variant.product.active) {
      throw new BusinessRuleError(
        "Uno de los productos del pedido ya no está disponible.",
        { variantId: item.variantId },
      );
    }

    // El precio enviado permite pactar un valor puntual; si no viene, manda
    // la lista de precios del cliente.
    const unitPrice =
      item.unitPrice ?? resolver.unitPriceFor(item.variantId, item.quantity);

    if (unitPrice === null || unitPrice === undefined) {
      throw new BusinessRuleError(
        `${variant.product.name} no tiene precio en la lista "${resolver.priceListName}".`,
        { variantId: item.variantId },
      );
    }

    return {
      variantId: variant.id,
      productNameSnapshot: variant.product.name,
      skuSnapshot: variant.sku,
      presentationSnapshot: variant.presentation,
      quantity: item.quantity,
      unitPrice,
      discount: item.discount,
      taxRate: Number(variant.product.taxRate),
    };
  });

  const totals = computeOrderTotals(prepared);

  return {
    totals,
    data: prepared.map((item, index) => ({
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      presentationSnapshot: item.presentationSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate,
      subtotal: totals.lines[index].subtotal,
    })),
  };
}

export async function createOrder(user: SessionUser, input: OrderCreateInput) {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      ownerId: true,
      status: true,
      paymentTerms: true,
      priceListId: true,
      addresses: {
        where: { active: true },
        orderBy: { isPrimary: "desc" },
        select: { id: true },
      },
    },
  });

  if (!client) throw new NotFoundError("El cliente");

  if (user.role === UserRole.VENDEDOR && client.ownerId !== user.id) {
    throw new ForbiddenError("Este cliente no está en tu cartera.");
  }

  if (client.status === "SUSPENDIDO") {
    throw new BusinessRuleError(
      "El cliente está suspendido: no se le pueden tomar pedidos.",
    );
  }

  // Si no eligieron sede, se usa la principal.
  const addressId = input.addressId ?? client.addresses[0]?.id;
  if (addressId && !client.addresses.some((a) => a.id === addressId)) {
    throw new BusinessRuleError("La sede de entrega no pertenece a este cliente.");
  }

  const { totals, data } = await buildOrderItems(client.priceListId, input.items);

  return prisma.order.create({
    data: {
      clientId: client.id,
      addressId,
      sellerId: user.id,
      channel: input.channel,
      requestedDeliveryDate: input.requestedDeliveryDate,
      notes: input.notes,
      paymentTerms: client.paymentTerms,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      items: { create: data },
    },
    include: { items: true },
  });
}

/** Solo se puede editar el contenido mientras el pedido sea BORRADOR. */
export async function updateOrder(
  user: SessionUser,
  id: string,
  input: OrderUpdateInput,
) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sellerId: true,
      client: { select: { id: true, priceListId: true } },
    },
  });

  if (!order) throw new NotFoundError("El pedido");
  assertCanAccess(user, order.sellerId);

  if (order.status !== OrderStatus.BORRADOR) {
    throw new BusinessRuleError(
      "Solo se puede modificar un pedido en borrador. Cancélalo y crea uno nuevo.",
    );
  }

  // Sin líneas nuevas, se actualizan únicamente los datos de cabecera.
  if (!input.items) {
    return prisma.order.update({
      where: { id },
      data: {
        addressId: input.addressId,
        channel: input.channel,
        requestedDeliveryDate: input.requestedDeliveryDate,
        notes: input.notes,
      },
      include: { items: true },
    });
  }

  const { totals, data } = await buildOrderItems(
    order.client.priceListId,
    input.items,
  );

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId: id } });

    return tx.order.update({
      where: { id },
      data: {
        addressId: input.addressId,
        channel: input.channel,
        requestedDeliveryDate: input.requestedDeliveryDate,
        notes: input.notes,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        items: { create: data },
      },
      include: { items: true },
    });
  });
}

/**
 * Cambia el estado de un pedido y ejecuta los efectos de inventario:
 * confirmar descuenta stock por FEFO, cancelar lo devuelve.
 */
export async function changeOrderStatus(
  user: SessionUser,
  id: string,
  input: OrderStatusChangeInput,
) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sellerId: true,
      stockAppliedAt: true,
      items: { select: { id: true } },
    },
  });

  if (!order) throw new NotFoundError("El pedido");
  assertCanAccess(user, order.sellerId);

  if (order.status === input.status) return order;

  if (!canTransition(order.status, input.status)) {
    throw new BusinessRuleError(
      `No se puede pasar un pedido de "${order.status}" a "${input.status}".`,
    );
  }

  if (input.status === OrderStatus.CANCELADO && !input.reason) {
    throw new BusinessRuleError("Indica el motivo de la cancelación.");
  }

  if (input.status === OrderStatus.CONFIRMADO && order.items.length === 0) {
    throw new BusinessRuleError("No se puede confirmar un pedido sin productos.");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    // `stockAppliedAt` hace la reserva idempotente: aunque se reintente la
    // confirmación, el inventario se descuenta una sola vez.
    if (input.status === OrderStatus.CONFIRMADO && !order.stockAppliedAt) {
      await allocateStockForOrder(tx, id, user.id);
    }

    if (input.status === OrderStatus.CANCELADO && order.stockAppliedAt) {
      await returnStockForOrder(
        tx,
        id,
        user.id,
        input.reason ?? "Cancelación de pedido",
      );
    }

    return tx.order.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.status === OrderStatus.CONFIRMADO
          ? { confirmedAt: now, stockAppliedAt: order.stockAppliedAt ?? now }
          : {}),
        ...(input.status === OrderStatus.ENTREGADO ? { deliveredAt: now } : {}),
        ...(input.status === OrderStatus.CANCELADO
          ? {
              cancelledAt: now,
              cancelReason: input.reason,
              // El stock ya volvió a bodega: deja de estar aplicado.
              stockAppliedAt: null,
            }
          : {}),
      },
    });
  });
}
