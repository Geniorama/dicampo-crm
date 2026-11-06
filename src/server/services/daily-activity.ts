import { prisma } from "../db";
import { ActivityType, LotStatus, OrderStatus, UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import { toKilos } from "@/lib/production";
import {
  productionPriority,
  type PriorityReason,
  type ProductionPriority,
} from "@/lib/production-priority";
import { SOLD_STATUSES } from "./analytics";

/**
 * Gestión diaria: qué hizo cada asesor hoy con su base de clientes, cómo van
 * los pedidos del día y qué sabores hay que producir.
 *
 * Es el pulso del día, no un reporte histórico: para eso están los reportes.
 */

/** Límites del día de Bogotá que contiene a `now`. */
export function bogotaDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const local = new TZDate(now, BUSINESS_TIME_ZONE);
  const start = new Date(
    new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0, BUSINESS_TIME_ZONE),
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Un VENDEDOR ve sus pedidos; el resto del equipo, todos. */
function sellerScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
}

// ── Gestión por asesor ───────────────────────────────────────

export type DailyRow = {
  userId: string;
  name: string;
  /** Clientes de la base contactados hoy por llamada o WhatsApp. */
  contacted: number;
  /** Visitas realizadas (completadas) hoy. */
  visitsDone: number;
  /** Clientes cuyo primer pedido vendido se hizo hoy. */
  newClientsClosed: number;
  collected: number;
};

export async function getDailyActivity(user: SessionUser, now: Date = new Date()): Promise<DailyRow[]> {
  const { start, end } = bogotaDayBounds(now);
  const today = { gte: start, lt: end };

  const [contacts, visits, payments, advisors, todaysOrders] = await Promise.all([
    prisma.activity.findMany({
      where: { type: { in: [ActivityType.LLAMADA, ActivityType.WHATSAPP] }, createdAt: today },
      select: { userId: true, clientId: true },
    }),
    prisma.activity.groupBy({
      by: ["userId"],
      where: { type: ActivityType.VISITA, completedAt: today },
      _count: { _all: true },
    }),
    prisma.payment.groupBy({
      by: ["userId"],
      where: { createdAt: today },
      _sum: { amount: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: [UserRole.VENDEDOR] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Pedidos vendidos de hoy: de ahí salen los clientes que cerraron hoy.
    prisma.order.findMany({
      where: { status: { in: SOLD_STATUSES }, orderDate: today },
      select: { clientId: true, client: { select: { ownerId: true } } },
    }),
  ]);

  // Cliente nuevo cerrado = su primer pedido vendido cae hoy (ninguno antes).
  const todayClientIds = [...new Set(todaysOrders.map((order) => order.clientId))];
  const hadBefore = todayClientIds.length
    ? new Set(
        (
          await prisma.order.groupBy({
            by: ["clientId"],
            where: {
              clientId: { in: todayClientIds },
              status: { in: SOLD_STATUSES },
              orderDate: { lt: start },
            },
          })
        ).map((row) => row.clientId),
      )
    : new Set<string>();
  const newClientOwner = new Map<string, string | null>();
  for (const order of todaysOrders) {
    if (!hadBefore.has(order.clientId)) newClientOwner.set(order.clientId, order.client.ownerId);
  }

  const collected = new Map(payments.map((row) => [row.userId, Number(row._sum.amount ?? 0)]));
  const visitsByUser = new Map(visits.map((row) => [row.userId, row._count._all]));

  return advisors
    .filter((advisor) => user.role !== UserRole.VENDEDOR || advisor.id === user.id)
    .map((advisor) => ({
      userId: advisor.id,
      name: advisor.name,
      contacted: new Set(
        contacts.filter((c) => c.userId === advisor.id).map((c) => c.clientId).filter(Boolean),
      ).size,
      visitsDone: visitsByUser.get(advisor.id) ?? 0,
      newClientsClosed: [...newClientOwner.values()].filter((ownerId) => ownerId === advisor.id).length,
      collected: collected.get(advisor.id) ?? 0,
    }));
}

// ── Contadores y listados de pedidos del día ─────────────────

export type OrderCounters = { placed: number; delivered: number; returned: number };

/** Pedidos realizados, entregados y devueltos hoy. */
export async function getOrderCounters(user: SessionUser, now: Date = new Date()): Promise<OrderCounters> {
  const { start, end } = bogotaDayBounds(now);
  const today = { gte: start, lt: end };
  const scope = sellerScope(user);

  const [placed, delivered, returned] = await Promise.all([
    prisma.order.count({ where: { ...scope, orderDate: today, status: { not: OrderStatus.CANCELADO } } }),
    prisma.order.count({ where: { ...scope, deliveredAt: today } }),
    prisma.deliveryAttempt.count({ where: { createdAt: today, order: scope } }),
  ]);

  return { placed, delivered, returned };
}

export type DayOrdersTab = "ayer" | "hoy";
export const DAY_ORDERS_PAGE_SIZE = 10;

/**
 * Pedidos montados ayer (se entregan hoy) o montados hoy (se entregan al día
 * siguiente), paginados de 10 en 10. Los cancelados no cuentan.
 */
export async function listDayOrders(
  user: SessionUser,
  tab: DayOrdersTab,
  page: number,
  now: Date = new Date(),
) {
  const { start, end } = bogotaDayBounds(now);
  const day =
    tab === "hoy" ? { gte: start, lt: end } : { gte: new Date(start.getTime() - 86_400_000), lt: start };
  const where = { ...sellerScope(user), orderDate: day, status: { not: OrderStatus.CANCELADO } };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { orderNumber: "desc" },
      skip: (page - 1) * DAY_ORDERS_PAGE_SIZE,
      take: DAY_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        total: true,
        client: { select: { businessName: true, tradeName: true } },
        seller: { select: { name: true } },
        route: { select: { driver: { select: { name: true } } } },
        address: { select: { locality: true } },
        items: {
          select: { productNameSnapshot: true, presentationSnapshot: true, quantity: true },
          orderBy: { productNameSnapshot: "asc" },
        },
      },
    }),
  ]);

  return {
    total,
    totalPages: Math.max(1, Math.ceil(total / DAY_ORDERS_PAGE_SIZE)),
    orders: rows.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      client: order.client.tradeName ?? order.client.businessName,
      total: Number(order.total),
      items: order.items.map((item) => ({
        name: item.productNameSnapshot,
        presentation: item.presentationSnapshot,
        quantity: Number(item.quantity),
      })),
      driver: order.route?.driver?.name ?? null,
      seller: order.seller?.name ?? null,
      locality: order.address?.locality ?? null,
    })),
  };
}

// ── Prioridades de producción ────────────────────────────────

export type ProductionPriorityRow = {
  productId: string;
  flavor: string;
  physicalKg: number;
  availableKg: number;
  priority: ProductionPriority;
  reason: PriorityReason;
};

/** Suma por variante de un groupBy, sea cual sea el campo sumado. */
function sumByVariant(rows: { variantId: string; _sum: object }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.variantId, Number(Object.values(row._sum)[0] ?? 0)]));
}

/**
 * Sabores que faltan o están por agotarse, de la prioridad más alta a la más
 * baja. Cuenta kilos de pulpa (la libra vale medio kilo); los zumos no.
 */
export async function getProductionPriorities(): Promise<ProductionPriorityRow[]> {
  const pending = [OrderStatus.CONFIRMADO, OrderStatus.EN_PREPARACION];

  const [variants, lots, reserved, drafts] = await Promise.all([
    prisma.productVariant.findMany({
      where: { active: true, product: { active: true, category: { not: "ZUMO" } } },
      select: { id: true, presentation: true, product: { select: { id: true, flavor: true } } },
    }),
    prisma.lot.groupBy({
      by: ["variantId"],
      where: { status: LotStatus.DISPONIBLE, quantityAvailable: { gt: 0 } },
      _sum: { quantityAvailable: true },
    }),
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: { status: { in: pending } } },
      _sum: { quantity: true },
    }),
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: { status: OrderStatus.BORRADOR } },
      _sum: { quantity: true },
    }),
  ]);

  const stock = sumByVariant(lots);
  const reservedQty = sumByVariant(reserved);
  const draftQty = sumByVariant(drafts);

  const byProduct = new Map<string, { flavor: string; available: number; reserved: number; unreserved: number }>();
  for (const variant of variants) {
    const entry = byProduct.get(variant.product.id) ?? {
      flavor: variant.product.flavor,
      available: 0,
      reserved: 0,
      unreserved: 0,
    };
    entry.available += toKilos(stock.get(variant.id) ?? 0, variant.presentation);
    entry.reserved += toKilos(reservedQty.get(variant.id) ?? 0, variant.presentation);
    entry.unreserved += toKilos(draftQty.get(variant.id) ?? 0, variant.presentation);
    byProduct.set(variant.product.id, entry);
  }

  const rows: ProductionPriorityRow[] = [];
  for (const [productId, entry] of byProduct) {
    const result = productionPriority({
      physicalKg: entry.available + entry.reserved,
      availableKg: entry.available,
      unreservedKg: entry.unreserved,
    });
    if (!result) continue;
    rows.push({
      productId,
      flavor: entry.flavor,
      physicalKg: entry.available + entry.reserved,
      availableKg: entry.available,
      ...result,
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.priority === "ALTA") - Number(a.priority === "ALTA") ||
      a.availableKg - b.availableKg ||
      a.flavor.localeCompare(b.flavor, "es"),
  );
}
