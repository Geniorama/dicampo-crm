import type { QuoteStatus } from "@/generated/prisma/enums";
import type { OrderLine } from "./order-math";

/**
 * Reglas puras de las cotizaciones.
 *
 * Como `order-math.ts`, viven en `lib/` para que el formulario y el servidor
 * calculen la misma cifra sin tocar la base de datos.
 */

/** Vigencia de una cotización: 15 días calendario desde la emisión (la del PDF actual). */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 15;

/** Pedido mínimo, en kilos. Un paquete de 1 kg rinde 8 porciones de 125 g. */
export const MIN_ORDER_KG = 8;
export const PORTIONS_PER_KG = 8;

/**
 * Transiciones permitidas. ACEPTADA y RECHAZADA son terminales: si el cliente
 * cambia de opinión se emite una cotización nueva. Una VENCIDA se puede
 * reenviar (el asesor la renueva con una vigencia nueva).
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  BORRADOR: ["ENVIADA", "RECHAZADA"],
  ENVIADA: ["ACEPTADA", "RECHAZADA", "VENCIDA"],
  VENCIDA: ["ENVIADA", "RECHAZADA"],
  ACEPTADA: [],
  RECHAZADA: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function nextQuoteStatuses(from: QuoteStatus): QuoteStatus[] {
  return QUOTE_TRANSITIONS[from];
}

/** Una cotización enviada cuya vigencia ya pasó se trata como vencida. */
export function isQuoteExpired(
  status: QuoteStatus,
  validUntil: Date | null,
  now: Date = new Date(),
): boolean {
  return status === "ENVIADA" && validUntil !== null && validUntil.getTime() < now.getTime();
}

/**
 * Reparte un descuento porcentual entre las líneas, sumándolo al descuento
 * que cada una ya trae. Va por línea (y no sobre el total) porque el IVA se
 * liquida sobre el neto de cada renglón.
 */
export function applyPercentDiscount(
  lines: readonly OrderLine[],
  percent: number,
): OrderLine[] {
  if (percent <= 0) return lines.map((line) => ({ ...line }));

  return lines.map((line) => {
    const gross = Math.round(line.quantity * line.unitPrice);
    const extra = Math.round(((gross - line.discount) * percent) / 100);

    return { ...line, discount: line.discount + Math.max(extra, 0) };
  });
}
