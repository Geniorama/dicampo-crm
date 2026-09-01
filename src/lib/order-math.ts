import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Aritmética y ciclo de vida de los pedidos.
 *
 * Vive en `lib/` —y no en el servicio— porque no toca la base de datos y lo
 * necesitan las dos orillas: el servidor lo usa para calcular lo que persiste,
 * y el formulario del navegador para mostrar el total en vivo. Una sola
 * implementación evita que la pantalla y la factura digan cifras distintas.
 */

export type OrderLine = {
  quantity: number;
  unitPrice: number;
  /** Descuento en pesos sobre la línea completa. */
  discount: number;
  /** Tarifa de IVA como fracción (0.19 = 19%). */
  taxRate: number;
};

export type OrderTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  lines: { subtotal: number; tax: number }[];
};

/** El peso colombiano no maneja centavos: todo importe se redondea a entero. */
function toPesos(value: number): number {
  return Math.round(value);
}

/**
 * Calcula los importes de un pedido.
 *
 * Por línea: bruto = cantidad × precio; neto = bruto − descuento;
 * impuesto = neto × tarifa. El descuento se aplica antes del IVA, que es
 * como debe liquidarse.
 */
export function computeOrderTotals(lines: readonly OrderLine[]): OrderTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  const computed = lines.map((line) => {
    const gross = toPesos(line.quantity * line.unitPrice);
    // Un descuento mayor que la línea dejaría el total en negativo.
    const lineDiscount = Math.min(toPesos(line.discount), gross);
    const net = gross - lineDiscount;
    const lineTax = toPesos(net * line.taxRate);

    subtotal += gross;
    discount += lineDiscount;
    tax += lineTax;

    return { subtotal: net, tax: lineTax };
  });

  return {
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax,
    lines: computed,
  };
}

/**
 * Transiciones permitidas. ENTREGADO y CANCELADO son terminales: corregir un
 * pedido entregado exige una devolución, no reabrirlo.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  BORRADOR: ["CONFIRMADO", "CANCELADO"],
  CONFIRMADO: ["EN_PREPARACION", "CANCELADO"],
  EN_PREPARACION: ["DESPACHADO", "CANCELADO"],
  DESPACHADO: ["ENTREGADO", "CANCELADO"],
  ENTREGADO: [],
  CANCELADO: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Estados a los que puede avanzar un pedido desde el actual. */
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
