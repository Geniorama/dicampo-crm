import { prisma } from "../db";
import { OrderStatus, QuoteStatus, RouteStatus, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "../guards";
import { DELIVERY_ZONES, zoneForLocality, type DeliveryZoneKey } from "@/lib/delivery-zones";
import { endOfBusinessDay, type OrderBoardQuery } from "../validators/order-board";

/**
 * Tablero de pedidos. Los pedidos nacen de las cotizaciones, así que el
 * listado parte de ellas: una fila por cotización con su pedido, sin las
 * anuladas. El estado contable es el de la cotización; los de producción y
 * despacho salen del pedido y de su ruta.
 */

export type ProductionState = "EN_PREPARACION" | "ALISTADO";
export type DispatchState = "EN_RUTA" | "PROGRAMADO" | "NO_ENVIADO" | "ENTREGADO";

export type OrderBoardRow = {
  orderId: string;
  orderNumber: number;
  quoteId: string;
  quoteCode: string;
  address: string | null;
  zone: DeliveryZoneKey | null;
  locality: string | null;
  client: string;
  neighborhood: string | null;
  route: string | null;
  deliveryDate: Date | null;
  accounting: QuoteStatus;
  production: ProductionState;
  /** Solo hay estado de despacho cuando el pedido está alistado. */
  dispatch: DispatchState | null;
  note: string | null;
  /** Productos del pedido, para sumar por pulpa. */
  items: { name: string; presentation: string; quantity: number }[];
};

/** Un pedido está alistado cuando bodega ya lo pasó de CONFIRMADO. */
export function productionState(status: OrderStatus): ProductionState {
  return status === OrderStatus.CONFIRMADO || status === OrderStatus.BORRADOR ? "EN_PREPARACION" : "ALISTADO";
}

export function dispatchState(
  status: OrderStatus,
  route: { status: RouteStatus } | null,
): DispatchState | null {
  if (productionState(status) !== "ALISTADO") return null;
  if (status === OrderStatus.ENTREGADO) return "ENTREGADO";
  if (status === OrderStatus.DESPACHADO || route?.status === RouteStatus.EN_RUTA) return "EN_RUTA";
  if (route) return "PROGRAMADO";
  return "NO_ENVIADO";
}

const BOARD_LIMIT = 500;

export async function listOrderBoard(user: SessionUser, query: OrderBoardQuery) {
  const { search, accounting, zone, day, view, page, pageSize } = query;

  const zoneLocalities = zone ? (DELIVERY_ZONES.find((z) => z.key === zone)?.localities ?? []) : [];

  const where: Prisma.QuoteWhereInput = {
    orderId: { not: null },
    // Las anuladas no aparecen.
    status: accounting ?? { not: QuoteStatus.ANULADO },
    ...(user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {}),
    order: {
      status: { not: OrderStatus.CANCELADO },
      // Por pulpa y por zona se agrupa lo que falta por entregar.
      ...(view !== "lista" ? { status: { notIn: [OrderStatus.CANCELADO, OrderStatus.ENTREGADO] } } : {}),
      ...(day
        ? { requestedDeliveryDate: { gte: day, lte: endOfBusinessDay(day) } }
        : {}),
    },
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
    ...(zone
      ? {
          address: {
            OR:
              zone === "NACIONAL"
                ? [{ locality: { not: null } }]
                : zoneLocalities.map((locality) => ({
                    locality: { equals: locality, mode: "insensitive" as const },
                  })),
          },
        }
      : {}),
  };

  const paged = view === "lista";
  const [rows, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { quoteDate: "desc" },
      skip: paged ? (page - 1) * pageSize : 0,
      take: paged ? pageSize : BOARD_LIMIT,
      select: {
        id: true,
        code: true,
        status: true,
        client: { select: { businessName: true, tradeName: true } },
        address: { select: { address: true, locality: true, neighborhood: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            requestedDeliveryDate: true,
            dispatchNote: true,
            route: { select: { name: true, status: true } },
            items: { select: { productNameSnapshot: true, presentationSnapshot: true, quantity: true } },
          },
        },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  let board: OrderBoardRow[] = rows.flatMap((quote) => {
    const order = quote.order;
    if (!order) return [];

    return [
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        quoteId: quote.id,
        quoteCode: quote.code,
        address: quote.address?.address ?? null,
        zone: zoneForLocality(quote.address?.locality),
        locality: quote.address?.locality ?? null,
        client: quote.client.tradeName ?? quote.client.businessName,
        neighborhood: quote.address?.neighborhood ?? null,
        route: order.route?.name ?? null,
        deliveryDate: order.requestedDeliveryDate,
        accounting: quote.status,
        production: productionState(order.status),
        dispatch: dispatchState(order.status, order.route),
        note: order.dispatchNote,
        items: order.items.map((item) => ({
          name: item.productNameSnapshot,
          presentation: item.presentationSnapshot,
          quantity: Number(item.quantity),
        })),
      },
    ];
  });

  // Nacional también recoge lo que no está en ninguna lista: se afina aquí.
  if (zone === "NACIONAL") board = board.filter((row) => row.zone === "NACIONAL");

  return {
    rows: board,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    truncated: !paged && total > BOARD_LIMIT,
  };
}

/** Suma de cantidades por pulpa y presentación, de mayor a menor. */
export function sumByFlavor(rows: OrderBoardRow[]) {
  const totals = new Map<string, { name: string; presentation: string; quantity: number; orders: Set<number> }>();

  for (const row of rows) {
    for (const item of row.items) {
      const key = `${item.name}|${item.presentation}`;
      const entry = totals.get(key) ?? {
        name: item.name,
        presentation: item.presentation,
        quantity: 0,
        orders: new Set<number>(),
      };
      entry.quantity += item.quantity;
      entry.orders.add(row.orderNumber);
      totals.set(key, entry);
    }
  }

  return [...totals.values()]
    .map((entry) => ({ ...entry, orders: entry.orders.size }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es"));
}

/** Agrupa las filas por zona (en el orden de la tabla del negocio) y, dentro, por ruta. */
export function groupByZone(rows: OrderBoardRow[]) {
  const order = [...DELIVERY_ZONES.map((z) => z.key), null] as (DeliveryZoneKey | null)[];

  return order
    .map((key) => {
      const inZone = rows.filter((row) => row.zone === key);
      const routes = new Map<string, OrderBoardRow[]>();
      for (const row of inZone) {
        const name = row.route ?? "Sin ruta";
        routes.set(name, [...(routes.get(name) ?? []), row]);
      }
      return { zone: key, count: inZone.length, routes: [...routes.entries()].map(([name, list]) => ({ name, rows: list })) };
    })
    .filter((group) => group.count > 0);
}
