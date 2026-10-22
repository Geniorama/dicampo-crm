import { describe, expect, it } from "vitest";
import { computeOrderTotals } from "./order-math";
import {
  applyPercentDiscount,
  canTransitionQuote,
  isQuoteExpired,
} from "./quote-rules";

describe("applyPercentDiscount", () => {
  it("reproduce la cotización COT-20260513-009 del Excel (15 % primer pedido)", () => {
    // Precios de distribuidor; el Excel muestra total $278.214 sobre $327.310.
    const lines = [
      { quantity: 6, unitPrice: 20_350, discount: 0, taxRate: 0 },
      { quantity: 6, unitPrice: 12_760, discount: 0, taxRate: 0 },
      { quantity: 2, unitPrice: 15_675, discount: 0, taxRate: 0 },
      { quantity: 3, unitPrice: 19_250, discount: 0, taxRate: 0 },
      { quantity: 1, unitPrice: 13_200, discount: 0, taxRate: 0 },
      { quantity: 1, unitPrice: 14_850, discount: 0, taxRate: 0 },
      { quantity: 1, unitPrice: 11_500, discount: 0, taxRate: 0 },
    ];

    const totals = computeOrderTotals(applyPercentDiscount(lines, 15));

    expect(totals.subtotal).toBe(327_310);
    // El Excel redondea el total; por línea la diferencia es de unos pesos.
    expect(Math.abs(totals.total - 278_214)).toBeLessThanOrEqual(4);
  });

  it("no cambia nada con 0 %", () => {
    const lines = [{ quantity: 2, unitPrice: 1_000, discount: 100, taxRate: 0.19 }];
    expect(applyPercentDiscount(lines, 0)).toEqual(lines);
  });

  it("suma al descuento que la línea ya traía", () => {
    const [line] = applyPercentDiscount(
      [{ quantity: 1, unitPrice: 10_000, discount: 1_000, taxRate: 0 }],
      10,
    );
    expect(line.discount).toBe(1_900);
  });
});

describe("estados de la cotización", () => {
  it("las terminales no avanzan", () => {
    expect(canTransitionQuote("ACEPTADA", "ENVIADA")).toBe(false);
    expect(canTransitionQuote("RECHAZADA", "BORRADOR")).toBe(false);
  });

  it("una vencida se puede reenviar", () => {
    expect(canTransitionQuote("VENCIDA", "ENVIADA")).toBe(true);
  });

  it("solo vence una enviada con vigencia pasada", () => {
    const past = new Date("2026-01-01");
    const now = new Date("2026-02-01");
    expect(isQuoteExpired("ENVIADA", past, now)).toBe(true);
    expect(isQuoteExpired("BORRADOR", past, now)).toBe(false);
    expect(isQuoteExpired("ENVIADA", null, now)).toBe(false);
  });
});
