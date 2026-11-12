import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Datos variables de venta de un cliente (último pedido, número de pedidos y
 * ticket promedio) y filtros de "Mis clientes".
 *
 * Parten del corte de la base maestra (lo vendido antes del CRM) y le suman
 * los pedidos del CRM **posteriores** a ese corte, para no contar dos veces
 * un pedido que ya venía en el Excel.
 */

export type SalesBase = {
  count: number;
  total: number;
  lastOrderAt: Date | null;
};

export type SalesOrder = { orderDate: Date; total: number };

export type SalesStats = {
  orderCount: number;
  avgTicket: number;
  lastOrderAt: Date | null;
};

export function computeSalesStats(base: SalesBase, orders: readonly SalesOrder[]): SalesStats {
  const cutoff = base.lastOrderAt?.getTime() ?? -Infinity;
  const fresh = orders.filter((order) => order.orderDate.getTime() > cutoff);

  const count = base.count + fresh.length;
  const total = base.total + fresh.reduce((sum, order) => sum + order.total, 0);
  const newest = fresh.reduce<Date | null>(
    (last, order) => (last === null || order.orderDate > last ? order.orderDate : last),
    null,
  );

  return {
    orderCount: count,
    avgTicket: count === 0 ? 0 : Math.round((total / count) * 100) / 100,
    lastOrderAt: newest ?? base.lastOrderAt,
  };
}

/** "AAAA-MM" de un momento, en hora de Bogotá. */
export function bogotaMonthKey(date: Date): string {
  const local = new TZDate(date, BUSINESS_TIME_ZONE);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
}

/** Límites [inicio, fin) de un mes "AAAA-MM" a medianoche de Bogotá. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    from: new Date(new TZDate(year, index, 1, BUSINESS_TIME_ZONE).getTime()),
    to: new Date(new TZDate(year, index + 1, 1, BUSINESS_TIME_ZONE).getTime()),
  };
}

/** Nombre del mes para el filtro: "noviembre de 2026". */
export function monthLabel(month: string): string {
  const range = monthRange(month);
  if (!range) return month;
  const label = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(range.from);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

const stripAccents = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Días que menciona un texto como "Lunes / Martes" (nombres canónicos, sin duplicados). */
export function parseDays(text: string | null | undefined): string[] {
  if (!text) return [];
  const normalized = stripAccents(text).toLowerCase();
  return DAY_NAMES.filter((day) => normalized.includes(stripAccents(day).toLowerCase()));
}

/** ¿El texto de días ("Lunes / Jueves") incluye este día? */
export function includesDay(text: string | null | undefined, day: string): boolean {
  return parseDays(text).includes(parseDays(day)[0] ?? "");
}

export const WEEKDAY_OPTIONS = DAY_NAMES;
