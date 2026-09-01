import { prisma } from "../db";
import { OrderStatus, UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import type { ReportQuery } from "../validators/reports";

/**
 * Conjuntos de datos detallados para exportar.
 *
 * A diferencia de `analytics.ts`, que devuelve agregados para mirar en
 * pantalla, esto devuelve el detalle fila por fila: lo que se cruza con
 * contabilidad, se analiza en tabla dinámica o se le entrega a una auditoría.
 *
 * Se aplica el mismo alcance: un VENDEDOR solo exporta su cartera.
 */

const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
];

function orderScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
}

/**
 * Un pedido por fila.
 *
 * Incluye los cancelados, a diferencia de los reportes de venta: para cuadrar
 * con contabilidad hace falta ver también lo que se anuló y por qué.
 */
export async function getOrdersDetail(user: SessionUser, query: ReportQuery) {
  const orders = await prisma.order.findMany({
    where: {
      ...orderScope(user),
      orderDate: { gte: query.rangeFrom, lte: query.rangeTo },
    },
    orderBy: { orderNumber: "asc" },
    select: {
      orderNumber: true,
      orderDate: true,
      requestedDeliveryDate: true,
      deliveredAt: true,
      status: true,
      channel: true,
      paymentTerms: true,
      paymentStatus: true,
      subtotal: true,
      discount: true,
      tax: true,
      total: true,
      cancelReason: true,
      client: { select: { businessName: true, tradeName: true, nit: true } },
      seller: { select: { name: true } },
      address: { select: { label: true, zone: { select: { name: true } } } },
      route: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return orders.map((order) => ({
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    requestedDeliveryDate: order.requestedDeliveryDate,
    deliveredAt: order.deliveredAt,
    client: order.client.tradeName ?? order.client.businessName,
    businessName: order.client.businessName,
    nit: order.client.nit,
    seller: order.seller?.name ?? "Sin vendedor",
    status: order.status,
    channel: order.channel,
    paymentTerms: order.paymentTerms,
    paymentStatus: order.paymentStatus,
    addressLabel: order.address?.label ?? "",
    zone: order.address?.zone?.name ?? "",
    route: order.route?.name ?? "",
    lineCount: order._count.items,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    total: Number(order.total),
    cancelReason: order.cancelReason ?? "",
  }));
}

/**
 * Una línea de pedido por fila. Es el grano con el que se arma una tabla
 * dinámica: producto × cliente × mes.
 */
export async function getOrderLines(user: SessionUser, query: ReportQuery) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        ...orderScope(user),
        status: { in: SOLD_STATUSES },
        orderDate: { gte: query.rangeFrom, lte: query.rangeTo },
      },
    },
    orderBy: [{ order: { orderNumber: "asc" } }, { productNameSnapshot: "asc" }],
    select: {
      productNameSnapshot: true,
      skuSnapshot: true,
      presentationSnapshot: true,
      quantity: true,
      unitPrice: true,
      discount: true,
      subtotal: true,
      order: {
        select: {
          orderNumber: true,
          orderDate: true,
          status: true,
          client: { select: { businessName: true, tradeName: true } },
          seller: { select: { name: true } },
        },
      },
    },
  });

  return items.map((item) => ({
    orderNumber: item.order.orderNumber,
    orderDate: item.order.orderDate,
    client: item.order.client.tradeName ?? item.order.client.businessName,
    seller: item.order.seller?.name ?? "Sin vendedor",
    product: item.productNameSnapshot,
    sku: item.skuSnapshot,
    presentation: item.presentationSnapshot,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    discount: Number(item.discount),
    subtotal: Number(item.subtotal),
  }));
}

/**
 * Kardex completo del período: la trazabilidad que pediría una auditoría o
 * el INVIMA. No se filtra por vendedor — el inventario es uno solo.
 */
export async function getKardexReport(query: ReportQuery) {
  const movements = await prisma.stockMovement.findMany({
    where: { createdAt: { gte: query.rangeFrom, lte: query.rangeTo } },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      type: true,
      quantity: true,
      reason: true,
      variant: {
        select: {
          sku: true,
          presentation: true,
          product: { select: { name: true } },
        },
      },
      lot: {
        select: { lotCode: true, productionDate: true, expiryDate: true },
      },
      order: { select: { orderNumber: true } },
      user: { select: { name: true } },
    },
  });

  return movements.map((movement) => ({
    date: movement.createdAt,
    product: movement.variant.product.name,
    sku: movement.variant.sku,
    presentation: movement.variant.presentation,
    lotCode: movement.lot?.lotCode ?? "",
    productionDate: movement.lot?.productionDate ?? null,
    expiryDate: movement.lot?.expiryDate ?? null,
    type: movement.type,
    quantity: Number(movement.quantity),
    orderNumber: movement.order?.orderNumber ?? null,
    user: movement.user?.name ?? "",
    reason: movement.reason ?? "",
  }));
}

/**
 * Directorio de clientes con su contacto principal y su sede principal.
 * Sirve para campañas y como respaldo de la cartera.
 */
export async function getClientDirectory(user: SessionUser) {
  const clients = await prisma.client.findMany({
    where: user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {},
    orderBy: { businessName: "asc" },
    select: {
      sequence: true,
      businessName: true,
      tradeName: true,
      nit: true,
      nitDv: true,
      type: true,
      status: true,
      phone: true,
      email: true,
      paymentTerms: true,
      creditLimit: true,
      createdAt: true,
      owner: { select: { name: true } },
      priceList: { select: { name: true } },
      contacts: {
        where: { active: true },
        orderBy: { isPrimary: "desc" },
        take: 1,
        select: {
          firstName: true,
          lastName: true,
          jobTitle: true,
          phone: true,
          whatsapp: true,
          email: true,
        },
      },
      addresses: {
        where: { active: true },
        orderBy: { isPrimary: "desc" },
        take: 1,
        select: {
          address: true,
          neighborhood: true,
          city: true,
          zone: { select: { name: true } },
        },
      },
      _count: { select: { orders: true } },
    },
  });

  return clients.map((client) => {
    const contact = client.contacts[0];
    const address = client.addresses[0];

    return {
      sequence: client.sequence,
      businessName: client.businessName,
      tradeName: client.tradeName ?? "",
      nit: client.nit ?? "",
      nitDv: client.nitDv ?? "",
      type: client.type,
      status: client.status,
      phone: client.phone ?? "",
      email: client.email ?? "",
      owner: client.owner?.name ?? "Sin asignar",
      paymentTerms: client.paymentTerms,
      creditLimit: Number(client.creditLimit),
      priceList: client.priceList?.name ?? "",
      contactName: contact
        ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
        : "",
      contactJob: contact?.jobTitle ?? "",
      contactPhone: contact?.whatsapp ?? contact?.phone ?? "",
      contactEmail: contact?.email ?? "",
      address: address?.address ?? "",
      neighborhood: address?.neighborhood ?? "",
      city: address?.city ?? "",
      zone: address?.zone?.name ?? "",
      orderCount: client._count.orders,
      createdAt: client.createdAt,
    };
  });
}
