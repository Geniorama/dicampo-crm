import { prisma } from "../db";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import type { SessionUser } from "../guards";
import { OrderStatus, UserRole } from "@/generated/prisma/enums";

/** Estados que cuentan como venta: un pedido cancelado no factura. */
const SOLD_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
];

/**
 * Métricas agregadas para el tablero.
 *
 * Un VENDEDOR ve solo su cartera; el resto de roles ve la operación completa.
 */

/** Filtro de pedidos según el alcance del usuario. */
function orderScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
}

/** Filtro de clientes según el alcance del usuario. */
function clientScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {};
}

export type DashboardMetrics = {
  activeClients: number;
  prospects: number;
  monthOrderCount: number;
  monthRevenue: number;
  previousMonthRevenue: number;
  pendingDispatch: number;
  expiringLots: number;
  overdueActivities: number;
};

export async function getDashboardMetrics(
  user: SessionUser,
): Promise<DashboardMetrics> {
  // Meses de Bogotá, no de la zona del servidor (UTC en Netlify).
  const now = TZDate.tz(BUSINESS_TIME_ZONE);
  const monthStart = new Date(
    new TZDate(now.getFullYear(), now.getMonth(), 1, BUSINESS_TIME_ZONE).getTime(),
  );
  const previousMonthStart = new Date(
    new TZDate(now.getFullYear(), now.getMonth() - 1, 1, BUSINESS_TIME_ZONE).getTime(),
  );
  const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const soldStatuses = { status: { in: SOLD_STATUSES } };

  const [
    activeClients,
    prospects,
    monthOrderCount,
    monthAggregate,
    previousMonthAggregate,
    pendingDispatch,
    expiringLots,
    overdueActivities,
  ] = await Promise.all([
    prisma.client.count({
      where: { ...clientScope(user), status: "ACTIVO" },
    }),

    prisma.client.count({
      where: { ...clientScope(user), status: "PROSPECTO" },
    }),

    prisma.order.count({
      where: {
        ...orderScope(user),
        ...soldStatuses,
        orderDate: { gte: monthStart },
      },
    }),

    prisma.order.aggregate({
      where: {
        ...orderScope(user),
        ...soldStatuses,
        orderDate: { gte: monthStart },
      },
      _sum: { total: true },
    }),

    prisma.order.aggregate({
      where: {
        ...orderScope(user),
        ...soldStatuses,
        orderDate: { gte: previousMonthStart, lt: monthStart },
      },
      _sum: { total: true },
    }),

    prisma.order.count({
      where: {
        ...orderScope(user),
        status: { in: ["CONFIRMADO", "EN_PREPARACION"] },
      },
    }),

    // Alerta de cadena de frío: lotes con saldo que vencen en 30 días.
    prisma.lot.count({
      where: {
        status: "DISPONIBLE",
        quantityAvailable: { gt: 0 },
        expiryDate: { lte: inThirtyDays },
      },
    }),

    prisma.activity.count({
      where: {
        userId: user.id,
        completedAt: null,
        dueAt: { lt: now },
      },
    }),
  ]);

  return {
    activeClients,
    prospects,
    monthOrderCount,
    monthRevenue: Number(monthAggregate._sum?.total ?? 0),
    previousMonthRevenue: Number(previousMonthAggregate._sum?.total ?? 0),
    pendingDispatch,
    expiringLots,
    overdueActivities,
  };
}

/** Últimos pedidos, para el listado del tablero. */
export async function getRecentOrders(user: SessionUser, take = 8) {
  return prisma.order.findMany({
    where: orderScope(user),
    orderBy: { orderDate: "desc" },
    take,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      orderDate: true,
      client: { select: { id: true, businessName: true, tradeName: true } },
    },
  });
}
