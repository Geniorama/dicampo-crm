import { prisma } from "../db";
import { OrderStatus, UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import type { ReportQuery } from "../validators/reports";

/**
 * Reportes analíticos.
 *
 * Separados de `reports.ts`, que solo alimenta los indicadores del tablero:
 * aquí las consultas son agregaciones sobre un rango de fechas, no contadores
 * del momento.
 *
 * Todos comparten dos reglas: un VENDEDOR ve solo su cartera, y los pedidos
 * cancelados nunca cuentan como venta.
 */

const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
];

/** Filtro base: alcance del usuario, rango de fechas y ventas reales. */
function reportWhere(user: SessionUser, query: ReportQuery) {
  return {
    ...(user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {}),
    ...(query.sellerId && user.role !== UserRole.VENDEDOR
      ? { sellerId: query.sellerId }
      : {}),
    status: { in: SOLD_STATUSES },
    orderDate: { gte: query.rangeFrom, lte: query.rangeTo },
  };
}

export type SalesSummary = {
  orderCount: number;
  revenue: number;
  averageTicket: number;
  clientCount: number;
};

export async function getSalesSummary(
  user: SessionUser,
  query: ReportQuery,
): Promise<SalesSummary> {
  const where = reportWhere(user, query);

  const [orderCount, aggregate, byClient] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { total: true } }),
    prisma.order.groupBy({ by: ["clientId"], where }),
  ]);

  const revenue = Number(aggregate._sum?.total ?? 0);

  return {
    orderCount,
    revenue,
    // Sin pedidos el promedio es cero, no una división por cero.
    averageTicket: orderCount === 0 ? 0 : Math.round(revenue / orderCount),
    clientCount: byClient.length,
  };
}

export type TrendPoint = { key: string; revenue: number; orders: number };

/**
 * Evolución de ventas, agrupada por día o por mes según el rango.
 *
 * El agrupamiento se hace en memoria y no con `date_trunc`: en SQL habría que
 * lidiar con la zona horaria del servidor, y el volumen de un distribuidor
 * local cabe de sobra en una consulta.
 */
export async function getSalesTrend(
  user: SessionUser,
  query: ReportQuery,
): Promise<{ granularity: "dia" | "mes"; points: TrendPoint[] }> {
  const orders = await prisma.order.findMany({
    where: reportWhere(user, query),
    select: { orderDate: true, total: true },
    orderBy: { orderDate: "asc" },
  });

  const spanDays =
    (query.rangeTo.getTime() - query.rangeFrom.getTime()) / (24 * 60 * 60 * 1000);
  const byMonth = spanDays > 92;

  const buckets = new Map<string, { revenue: number; orders: number }>();

  for (const order of orders) {
    const date = order.orderDate;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const key = byMonth
      ? month
      : `${month}-${String(date.getDate()).padStart(2, "0")}`;

    const bucket = buckets.get(key) ?? { revenue: 0, orders: 0 };
    bucket.revenue += Number(order.total);
    bucket.orders += 1;
    buckets.set(key, bucket);
  }

  return {
    granularity: byMonth ? "mes" : "dia",
    points: [...buckets.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}

/** Ventas por vendedor, de mayor a menor. */
export async function getSalesBySeller(user: SessionUser, query: ReportQuery) {
  const grouped = await prisma.order.groupBy({
    by: ["sellerId"],
    where: reportWhere(user, query),
    _sum: { total: true },
    _count: true,
  });

  const ids = grouped
    .map((row) => row.sellerId)
    .filter((id): id is string => id !== null);
  const sellers = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(sellers.map((seller) => [seller.id, seller.name]));

  return grouped
    .map((row) => ({
      sellerId: row.sellerId,
      name: row.sellerId
        ? (nameById.get(row.sellerId) ?? "Desconocido")
        : "Sin vendedor",
      orders: row._count,
      revenue: Number(row._sum?.total ?? 0),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Ventas por presentación: qué rota y qué no. */
export async function getSalesByProduct(user: SessionUser, query: ReportQuery) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: { order: reportWhere(user, query) },
    _sum: { quantity: true, subtotal: true },
  });

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: grouped.map((row) => row.variantId) } },
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true } },
    },
  });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  return grouped
    .map((row) => {
      const variant = variantById.get(row.variantId);
      return {
        variantId: row.variantId,
        productName: variant?.product.name ?? "Producto eliminado",
        sku: variant?.sku ?? "—",
        presentation: variant?.presentation ?? null,
        quantity: Number(row._sum?.quantity ?? 0),
        revenue: Number(row._sum?.subtotal ?? 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Clientes activos que llevan demasiado tiempo sin comprar.
 *
 * Es el reporte más accionable para Dicampo: un restaurante que compraba cada
 * semana y lleva un mes callado probablemente cambió de proveedor. Los que
 * nunca han comprado también aparecen — son una venta que quedó a medias.
 */
export async function getRepurchaseAlerts(
  user: SessionUser,
  query: ReportQuery,
) {
  const threshold = new Date(
    Date.now() - query.inactiveDays * 24 * 60 * 60 * 1000,
  );

  const clients = await prisma.client.findMany({
    where: {
      ...(user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {}),
      status: "ACTIVO",
    },
    select: {
      id: true,
      businessName: true,
      tradeName: true,
      phone: true,
      owner: { select: { name: true } },
      orders: {
        where: { status: { in: SOLD_STATUSES } },
        orderBy: { orderDate: "desc" },
        take: 1,
        select: { orderDate: true, total: true },
      },
      _count: { select: { orders: true } },
    },
  });

  return clients
    .map((client) => {
      const last = client.orders[0];
      return {
        id: client.id,
        name: client.tradeName ?? client.businessName,
        phone: client.phone,
        owner: client.owner?.name ?? "Sin asignar",
        lastOrderDate: last?.orderDate ?? null,
        lastOrderTotal: last ? Number(last.total) : 0,
        daysSince: last
          ? Math.floor(
              (Date.now() - last.orderDate.getTime()) / (24 * 60 * 60 * 1000),
            )
          : null,
        orderCount: client._count.orders,
      };
    })
    .filter((row) => row.lastOrderDate === null || row.lastOrderDate < threshold)
    // Los que nunca compraron van primero: son la alerta más fuerte.
    .sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity));
}

/**
 * Rotación: cuánto salió por venta en el período frente al saldo actual.
 * Los días de cobertura estiman cuánto dura el stock al ritmo observado.
 */
export async function getInventoryTurnover(query: ReportQuery) {
  const [movements, lots, variants] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ["variantId"],
      where: {
        type: "SALIDA_VENTA",
        createdAt: { gte: query.rangeFrom, lte: query.rangeTo },
      },
      _sum: { quantity: true },
    }),
    prisma.lot.groupBy({
      by: ["variantId"],
      where: { status: "DISPONIBLE", quantityAvailable: { gt: 0 } },
      _sum: { quantityAvailable: true },
    }),
    prisma.productVariant.findMany({
      where: { active: true, product: { active: true } },
      select: {
        id: true,
        sku: true,
        presentation: true,
        product: { select: { name: true } },
      },
    }),
  ]);

  // Las salidas se guardan en negativo; aquí interesa la magnitud vendida.
  const soldById = new Map(
    movements.map((row) => [
      row.variantId,
      Math.abs(Number(row._sum?.quantity ?? 0)),
    ]),
  );
  const stockById = new Map(
    lots.map((row) => [row.variantId, Number(row._sum?.quantityAvailable ?? 0)]),
  );

  const days = Math.max(
    1,
    Math.round(
      (query.rangeTo.getTime() - query.rangeFrom.getTime()) /
        (24 * 60 * 60 * 1000),
    ),
  );

  return variants
    .map((variant) => {
      const sold = soldById.get(variant.id) ?? 0;
      const stock = stockById.get(variant.id) ?? 0;
      const dailyRate = sold / days;

      return {
        variantId: variant.id,
        productName: variant.product.name,
        sku: variant.sku,
        presentation: variant.presentation,
        sold,
        stock,
        // Sin ventas no hay ritmo del que estimar cobertura.
        coverageDays: dailyRate > 0 ? Math.round(stock / dailyRate) : null,
      };
    })
    .sort((a, b) => b.sold - a.sold);
}
