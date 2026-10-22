import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Cartera: lo que los clientes deben de pedidos ya entregados.
 *
 * Un pedido entra a cartera al entregarse; vence al cumplirse el plazo de pago
 * pactado (contado, 8, 15 o 30 días) contado desde el día de entrega. Todo el
 * cálculo es por **día de calendario de Bogotá**: un pedido entregado a las
 * 8 p. m. se entregó ese día, no el siguiente, y vence el último día del plazo.
 */

export const TERM_DAYS: Record<string, number> = {
  CONTADO: 0,
  CREDITO_8: 8,
  CREDITO_15: 15,
  CREDITO_30: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Día de calendario de Bogotá de un instante, como "AAAA-MM-DD". */
export function bogotaDay(instant: Date): string {
  const local = new TZDate(instant, BUSINESS_TIME_ZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);

/** Último día para pagar: el de entrega más el plazo. */
export function dueDay(deliveredAt: Date, terms: string): string {
  const days = TERM_DAYS[terms] ?? 0;
  const due = new Date((dayNumber(bogotaDay(deliveredAt)) + days) * DAY_MS);
  return due.toISOString().slice(0, 10);
}

/** Días de atraso (0 si aún no vence). El día de vencimiento todavía es plazo. */
export function daysOverdue(due: string, now: Date = new Date()): number {
  return Math.max(0, dayNumber(bogotaDay(now)) - dayNumber(due));
}

export type AgingBucket = "AL_DIA" | "1_30" | "31_60" | "MAS_60";

export function agingBucket(overdueDays: number): AgingBucket {
  if (overdueDays <= 0) return "AL_DIA";
  if (overdueDays <= 30) return "1_30";
  if (overdueDays <= 60) return "31_60";
  return "MAS_60";
}

export const AGING_LABEL: Record<AgingBucket, string> = {
  AL_DIA: "Al día",
  "1_30": "1–30 días",
  "31_60": "31–60 días",
  MAS_60: "Más de 60 días",
};

export type PaymentStatusValue = "PENDIENTE" | "PARCIAL" | "PAGADO";

/** Estado de pago a partir de lo pagado: se recalcula, nunca se escribe a mano. */
export function paymentStatusFor(total: number, paid: number): PaymentStatusValue {
  if (paid <= 0) return "PENDIENTE";
  return paid >= total ? "PAGADO" : "PARCIAL";
}

export type ReceivableOrder = {
  id: string;
  total: number;
  paid: number;
  deliveredAt: Date;
  terms: string;
};

export type ReceivableOrderView = ReceivableOrder & {
  balance: number;
  due: string;
  overdueDays: number;
  bucket: AgingBucket;
};

export type ClientReceivable = {
  balance: number;
  overdue: number;
  /** Mayor atraso entre sus pedidos con saldo. */
  maxOverdueDays: number;
  orders: ReceivableOrderView[];
};

/** Saldo, vencido y atraso de un cliente a partir de sus pedidos entregados. */
export function summarizeClient(
  orders: readonly ReceivableOrder[],
  now: Date = new Date(),
): ClientReceivable {
  const views = orders
    .map((order) => {
      const balance = Math.round(order.total - order.paid);
      const due = dueDay(order.deliveredAt, order.terms);
      const overdueDays = daysOverdue(due, now);
      return { ...order, balance, due, overdueDays, bucket: agingBucket(overdueDays) };
    })
    .filter((order) => order.balance > 0)
    // Lo más vencido primero: es lo que hay que cobrar antes.
    .sort((a, b) => b.overdueDays - a.overdueDays || a.due.localeCompare(b.due));

  return {
    balance: views.reduce((sum, order) => sum + order.balance, 0),
    overdue: views.filter((order) => order.overdueDays > 0).reduce((sum, order) => sum + order.balance, 0),
    maxOverdueDays: views.reduce((max, order) => Math.max(max, order.overdueDays), 0),
    orders: views,
  };
}
