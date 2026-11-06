import type { QuoteStatus } from "@/generated/prisma/enums";
import type { OrderLine } from "./order-math";

/**
 * Reglas puras de las cotizaciones.
 *
 * Como `order-math.ts`, viven en `lib/` para que el formulario y el servidor
 * calculen la misma cifra sin tocar la base de datos.
 */

/** Pedido mínimo, en kilos. Un paquete de 1 kg rinde 8 porciones de 125 g. */
export const MIN_ORDER_KG = 8;
export const PORTIONS_PER_KG = 8;

/**
 * Transiciones permitidas. La cotización crea el pedido al guardarse, así que
 * solo hay tres estados contables que cambia un administrador. Facturada se
 * puede devolver a pendiente (corregir un error); anulada es terminal porque
 * anular cancela el pedido y devuelve el inventario.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  PENDIENTE_FACTURAR: ["FACTURADO", "ANULADO"],
  FACTURADO: ["PENDIENTE_FACTURAR", "ANULADO"],
  ANULADO: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function nextQuoteStatuses(from: QuoteStatus): QuoteStatus[] {
  return QUOTE_TRANSITIONS[from];
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
