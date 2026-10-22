import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Hábitos de compra de un cliente, derivados de su historial de pedidos.
 *
 * Es lo que el asesor necesita ver antes de llamar: cada cuánto pide, qué día,
 * qué sabores y qué cantidades. Se calcula, no se captura a mano, para que
 * nunca se desactualice respecto de los pedidos.
 */

export type ProfileOrder = {
  orderDate: Date;
  total: number;
  items: { name: string; quantity: number }[];
};

export type PurchaseProfile = {
  orderCount: number;
  lastOrderAt: Date | null;
  /** Días promedio entre pedidos; null con menos de dos pedidos. */
  avgIntervalDays: number | null;
  /** Días de la semana (0 = domingo) en que suele pedir, de más a menos frecuente. */
  usualWeekdays: number[];
  /** Sabores más pedidos, por kilos acumulados. */
  topFlavors: string[];
  /** Cantidad típica por producto: promedio entre los pedidos donde aparece. */
  habitualOrder: { name: string; quantity: number }[];
  avgTicket: number;
};

export const WEEKDAY_LABEL = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

/** Día de la semana en Bogotá (0 = domingo). Netlify corre en UTC. */
export function bogotaWeekday(date: Date): number {
  return new TZDate(date, BUSINESS_TIME_ZONE).getDay();
}

/** Redondea al medio kilo, que es como se piden las cantidades. */
function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

const MS_PER_DAY = 86_400_000;

export function computePurchaseProfile(orders: readonly ProfileOrder[]): PurchaseProfile {
  if (orders.length === 0) {
    return {
      orderCount: 0,
      lastOrderAt: null,
      avgIntervalDays: null,
      usualWeekdays: [],
      topFlavors: [],
      habitualOrder: [],
      avgTicket: 0,
    };
  }

  const sorted = [...orders].sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
  const first = sorted[0].orderDate;
  const last = sorted[sorted.length - 1].orderDate;

  const avgIntervalDays =
    sorted.length > 1
      ? Math.round(((last.getTime() - first.getTime()) / MS_PER_DAY / (sorted.length - 1)) * 10) / 10
      : null;

  // Días habituales: los que concentran al menos la mitad de lo que el día
  // más frecuente. Con un pedido solo, ese día es el único dato que hay.
  const byWeekday = new Map<number, number>();
  for (const order of sorted) {
    const day = bogotaWeekday(order.orderDate);
    byWeekday.set(day, (byWeekday.get(day) ?? 0) + 1);
  }
  const maxCount = Math.max(...byWeekday.values());
  const usualWeekdays = [...byWeekday.entries()]
    .filter(([, count]) => count >= Math.max(1, maxCount / 2))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([day]) => day);

  const perProduct = new Map<string, { total: number; orders: number }>();
  for (const order of sorted) {
    const seen = new Map<string, number>();
    for (const item of order.items) {
      seen.set(item.name, (seen.get(item.name) ?? 0) + item.quantity);
    }
    for (const [name, quantity] of seen) {
      const entry = perProduct.get(name) ?? { total: 0, orders: 0 };
      entry.total += quantity;
      entry.orders += 1;
      perProduct.set(name, entry);
    }
  }

  const topFlavors = [...perProduct.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], "es"))
    .slice(0, 5)
    .map(([name]) => name);

  // El pedido habitual solo incluye lo que pidió en al menos la mitad de los
  // pedidos: un antojo de una vez no es costumbre.
  const habitualOrder = [...perProduct.entries()]
    .filter(([, entry]) => entry.orders >= sorted.length / 2)
    .map(([name, entry]) => ({
      name,
      quantity: Math.max(0.5, roundToHalf(entry.total / entry.orders)),
    }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "es"));

  const avgTicket = Math.round(
    sorted.reduce((sum, order) => sum + order.total, 0) / sorted.length,
  );

  return {
    orderCount: sorted.length,
    lastOrderAt: last,
    avgIntervalDays,
    usualWeekdays,
    topFlavors,
    habitualOrder,
    avgTicket,
  };
}
