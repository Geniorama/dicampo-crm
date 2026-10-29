import { prisma } from "../db";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors";
import { UserRole, OrderStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { buildPriceResolver } from "./pricing";
import { allocateStockForOrder, returnStockForOrder } from "./inventory";
import { recordPayment } from "./receivables";
import { canTransition, computeOrderTotals } from "@/lib/order-math";
import { bogotaDay, paymentStatusFor } from "@/lib/receivables";
import type {
  HistoricalOrderInput,
  OrderCreateInput,
  OrderListQuery,
  OrderSellerInput,
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
      deliveryAttempts: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
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
  // El histórico puede traer productos ya retirados del catálogo.
  { includeInactive = false }: { includeInactive?: boolean } = {},
) {
  const variantIds = items.map((item) => item.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, ...(includeInactive ? {} : { active: true }) },
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
    if (!variant || (!includeInactive && !variant.product.active)) {
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

/** Roles a los que se les puede atribuir una venta. */
const SELLER_ROLES: UserRole[] = [UserRole.VENDEDOR, UserRole.ADMIN];

/**
 * Decide a qué asesor se atribuye un pedido.
 *
 * Un VENDEDOR siempre vende a su nombre. Quien registra por otro (ADMIN)
 * puede elegir; si no elige, la venta es del responsable del cliente, que es
 * a quien le cuenta para sus metas. Sin responsable, de quien la registra.
 */
export async function resolveOrderSeller(
  user: SessionUser,
  requestedId: string | undefined,
  clientOwnerId: string | null,
  // Una venta pasada sí puede ser de alguien que ya se fue.
  { allowInactive = false }: { allowInactive?: boolean } = {},
): Promise<string> {
  if (user.role === UserRole.VENDEDOR) {
    if (requestedId && requestedId !== user.id) {
      throw new ForbiddenError("Un vendedor solo registra pedidos a su nombre.");
    }
    return user.id;
  }

  const sellerId = requestedId ?? clientOwnerId ?? user.id;
  if (sellerId === user.id && !requestedId && !clientOwnerId) return sellerId;

  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { active: true, role: true },
  });
  if (!seller) throw new NotFoundError("El vendedor");

  // El responsable del cliente puede haberse ido: entonces, quien registra.
  if (!requestedId && (!seller.active || !SELLER_ROLES.includes(seller.role))) {
    return user.id;
  }
  if (!seller.active && !allowInactive) {
    throw new BusinessRuleError("Ese vendedor está inactivo.");
  }
  if (!SELLER_ROLES.includes(seller.role)) {
    throw new BusinessRuleError("Solo se le atribuyen ventas a un vendedor o administrador.");
  }

  return sellerId;
}

/** Asesores a los que se puede atribuir una venta, para los selectores. */
export async function listSellerOptions() {
  return prisma.user.findMany({
    where: { active: true, role: { in: SELLER_ROLES } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
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

  const sellerId = await resolveOrderSeller(user, input.sellerId, client.ownerId);
  const { totals, data } = await buildOrderItems(client.priceListId, input.items);

  return prisma.order.create({
    data: {
      clientId: client.id,
      addressId,
      sellerId,
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

/**
 * Corrige a qué asesor se atribuye un pedido, en cualquier estado: es dato
 * comercial (metas, reportes), no toca inventario ni importes. Solo ADMIN,
 * lo exige la ruta.
 */
export async function changeOrderSeller(
  user: SessionUser,
  id: string,
  input: OrderSellerInput,
) {
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!order) throw new NotFoundError("El pedido");

  const sellerId = await resolveOrderSeller(user, input.sellerId, null);

  return prisma.order.update({
    where: { id },
    data: { sellerId },
    select: { id: true, seller: { select: { id: true, name: true } } },
  });
}

// ─────────────────────────────────────────────────────────────
// Pedidos históricos (carga por archivo)
// ─────────────────────────────────────────────────────────────

/**
 * Valida un pedido histórico y calcula sus importes sin escribir nada. La
 * carga masiva lo usa tal cual para simular, así la vista previa y la
 * ejecución recorren las mismas reglas.
 */
export async function prepareHistoricalOrder(
  user: SessionUser,
  input: HistoricalOrderInput,
) {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: {
      id: true,
      ownerId: true,
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

  if (input.addressId && !(await prisma.clientAddress.count({
    where: { id: input.addressId, clientId: client.id },
  }))) {
    throw new BusinessRuleError("La sede de entrega no pertenece a este cliente.");
  }

  const sellerId = await resolveOrderSeller(user, input.sellerId, client.ownerId, {
    allowInactive: true,
  });
  const { totals, data } = await buildOrderItems(client.priceListId, input.items, {
    includeInactive: true,
  });

  const paid = input.paidAmount ?? totals.total;
  if (paid > totals.total) {
    throw new BusinessRuleError(
      `Lo pagado (${paid.toLocaleString("es-CO")}) supera el total del pedido (${totals.total.toLocaleString("es-CO")}).`,
    );
  }

  return {
    client,
    sellerId,
    addressId: input.addressId ?? client.addresses[0]?.id,
    totals,
    items: data,
    paid,
  };
}

/**
 * Registra una venta que ya ocurrió: entra ENTREGADO, con sus precios y su
 * fecha, cuenta para metas, reportes y cartera, y **no descuenta
 * inventario** (esa mercancía ya salió; descontarla hoy descuadraría los
 * lotes). `externalRef` la hace idempotente.
 */
export async function importHistoricalOrder(
  user: SessionUser,
  input: HistoricalOrderInput,
) {
  const prepared = await prepareHistoricalOrder(user, input);

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          externalRef: input.externalRef,
          clientId: prepared.client.id,
          addressId: prepared.addressId,
          sellerId: prepared.sellerId,
          status: OrderStatus.ENTREGADO,
          channel: input.channel,
          orderDate: input.orderDate,
          confirmedAt: input.orderDate,
          deliveredAt: input.deliveredAt,
          requestedDeliveryDate: calendarDateOf(input.deliveredAt),
          paymentTerms: input.paymentTerms ?? prepared.client.paymentTerms,
          paymentStatus: paymentStatusFor(prepared.totals.total, 0),
          notes: input.notes,
          subtotal: prepared.totals.subtotal,
          discount: prepared.totals.discount,
          tax: prepared.totals.tax,
          total: prepared.totals.total,
          items: { create: prepared.items },
        },
        select: { id: true, orderNumber: true, total: true },
      });

      // El cobro pasa por la misma regla de saldo que /cartera.
      if (prepared.paid > 0) {
        await recordPayment(tx, user, order.id, {
          amount: prepared.paid,
          method: input.paymentMethod,
          paidAt: input.deliveredAt,
          reference: `Histórico ${input.externalRef}`,
        });
      }

      return order;
    });
  } catch (error) {
    // Dos cargas a la vez con el mismo número: gana la primera.
    if ((error as { code?: string }).code === "P2002") {
      throw new ConflictError(`El pedido ${input.externalRef} ya estaba cargado.`);
    }
    throw error;
  }
}

/**
 * Fecha de calendario (medianoche UTC) del día en Bogotá de un momento, que es
 * como se guarda `requestedDeliveryDate`.
 */
function calendarDateOf(instant: Date): Date {
  return new Date(`${bogotaDay(instant)}T00:00:00.000Z`);
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
