/**
 * Política de descuentos de las cotizaciones, tal como la aplica hoy el
 * cotizador de Apps Script:
 *
 * - Negociación especial "X-Y" (15-10, 15-5…): X % en el primer pedido de cada
 *   sede, Y % en los siguientes. Es fijo: el asesor no lo cambia.
 * - Cliente nuevo (sin historial): 15 % de "primer pedido", o ninguno.
 * - Cliente con historial y sin negociación: descuento manual de 0 a 8 %.
 *
 * Un ADMIN puede salirse de esos topes. Pura y sin base de datos, para que el
 * formulario muestre lo mismo que valida el servidor.
 */

export const NEW_CLIENT_DISCOUNT_PCT = 15;
export const MAX_MANUAL_DISCOUNT_PCT = 8;

export type DiscountKind = "NEGOCIACION" | "NUEVO" | "MANUAL";

export type DiscountPolicy = {
  kind: DiscountKind;
  /** Porcentaje que se propone por defecto. */
  suggested: number;
  /** Solo en negociación: es la primera compra de esa sede. */
  firstOfAddress: boolean;
  /** Porcentajes que un vendedor puede elegir (rango o lista exacta). */
  allowed: { min: number; max: number } | { only: readonly number[] };
};

export type PolicyInput = {
  negotiation: { first: number; next: number } | null;
  /** El cliente ya tuvo cotizaciones o pedidos. */
  clientHasHistory: boolean;
  /** Esa sede ya tuvo cotizaciones o pedidos (cuenta para "primer pedido de la sede"). */
  addressHasHistory: boolean;
};

export function discountPolicy(input: PolicyInput): DiscountPolicy {
  if (input.negotiation) {
    const pct = input.addressHasHistory ? input.negotiation.next : input.negotiation.first;
    return {
      kind: "NEGOCIACION",
      suggested: pct,
      firstOfAddress: !input.addressHasHistory,
      allowed: { only: [pct] },
    };
  }

  if (!input.clientHasHistory) {
    return {
      kind: "NUEVO",
      suggested: NEW_CLIENT_DISCOUNT_PCT,
      firstOfAddress: true,
      allowed: { only: [0, NEW_CLIENT_DISCOUNT_PCT] },
    };
  }

  return {
    kind: "MANUAL",
    suggested: 0,
    firstOfAddress: false,
    allowed: { min: 0, max: MAX_MANUAL_DISCOUNT_PCT },
  };
}

export function isDiscountAllowed(policy: DiscountPolicy, pct: number): boolean {
  return "only" in policy.allowed
    ? policy.allowed.only.includes(pct)
    : pct >= policy.allowed.min && pct <= policy.allowed.max;
}

/** Texto que queda en la cotización y en el Histórico, igual al del cotizador. */
export function discountLabel(
  kind: DiscountKind,
  pct: number,
  opts: { firstOfAddress?: boolean } = {},
): string {
  if (pct <= 0) return "Sin descuento";
  switch (kind) {
    case "NEGOCIACION":
      return `Negociación especial ${pct}%${opts.firstOfAddress ? " (1er pedido sede)" : ""}`;
    case "NUEVO":
      return `Promo ${pct}% primer pedido`;
    case "MANUAL":
      return `Descuento manual ${pct}%`;
  }
}

/** "15-10" → { first: 15, next: 10 }; cualquier otra cosa → null. */
export function parseNegotiation(value: string | null | undefined): { first: number; next: number } | null {
  const match = /^\s*(\d{1,2})\s*[-–/]\s*(\d{1,2})\s*$/.exec(value ?? "");
  return match ? { first: Number(match[1]), next: Number(match[2]) } : null;
}

export function formatNegotiation(first: number | null, next: number | null): string {
  return first === null || next === null ? "" : `${first}-${next}`;
}
