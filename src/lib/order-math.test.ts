import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  computeOrderTotals,
  type OrderLine,
} from "./order-math";

const line = (overrides: Partial<OrderLine> = {}): OrderLine => ({
  quantity: 1,
  unitPrice: 12_000,
  discount: 0,
  taxRate: 0,
  ...overrides,
});

describe("computeOrderTotals", () => {
  it("multiplica cantidad por precio", () => {
    const totals = computeOrderTotals([line({ quantity: 10 })]);

    expect(totals.subtotal).toBe(120_000);
    expect(totals.total).toBe(120_000);
  });

  it("suma varias líneas", () => {
    const totals = computeOrderTotals([
      line({ quantity: 10, unitPrice: 12_000 }), // 120.000
      line({ quantity: 5, unitPrice: 18_000 }), // 90.000
    ]);

    expect(totals.subtotal).toBe(210_000);
    expect(totals.total).toBe(210_000);
  });

  it("resta el descuento del total", () => {
    const totals = computeOrderTotals([
      line({ quantity: 10, discount: 20_000 }),
    ]);

    expect(totals.subtotal).toBe(120_000);
    expect(totals.discount).toBe(20_000);
    expect(totals.total).toBe(100_000);
  });

  it("aplica el IVA después del descuento", () => {
    const totals = computeOrderTotals([
      line({ quantity: 10, unitPrice: 10_000, discount: 20_000, taxRate: 0.19 }),
    ]);

    // Bruto 100.000 − descuento 20.000 = 80.000; IVA 19% = 15.200
    expect(totals.tax).toBe(15_200);
    expect(totals.total).toBe(95_200);
  });

  it("no permite que el descuento supere el bruto de la línea", () => {
    const totals = computeOrderTotals([
      line({ quantity: 1, unitPrice: 12_000, discount: 50_000 }),
    ]);

    expect(totals.discount).toBe(12_000);
    expect(totals.total).toBe(0);
  });

  it("redondea a pesos enteros: el COP no maneja centavos", () => {
    const totals = computeOrderTotals([
      line({ quantity: 0.5, unitPrice: 12_345, taxRate: 0.19 }),
    ]);

    // 0,5 × 12.345 = 6.172,5 → 6.173 (redondeo); IVA 6.173 × 0,19 = 1.172,87 → 1.173
    expect(totals.subtotal).toBe(6_173);
    expect(totals.tax).toBe(1_173);
    expect(Number.isInteger(totals.total)).toBe(true);
  });

  it("devuelve el neto de cada línea para persistirlo", () => {
    const totals = computeOrderTotals([
      line({ quantity: 10, discount: 20_000 }),
      line({ quantity: 2 }),
    ]);

    expect(totals.lines).toEqual([
      { subtotal: 100_000, tax: 0 },
      { subtotal: 24_000, tax: 0 },
    ]);
  });

  it("un pedido sin líneas vale cero", () => {
    expect(computeOrderTotals([])).toEqual({
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      lines: [],
    });
  });
});

describe("canTransition", () => {
  it("permite el camino feliz completo", () => {
    expect(canTransition(OrderStatus.BORRADOR, OrderStatus.CONFIRMADO)).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMADO, OrderStatus.EN_PREPARACION)).toBe(true);
    expect(canTransition(OrderStatus.EN_PREPARACION, OrderStatus.DESPACHADO)).toBe(true);
    expect(canTransition(OrderStatus.DESPACHADO, OrderStatus.ENTREGADO)).toBe(true);
  });

  it("permite cancelar desde cualquier estado no terminal", () => {
    for (const status of [
      OrderStatus.BORRADOR,
      OrderStatus.CONFIRMADO,
      OrderStatus.EN_PREPARACION,
      OrderStatus.DESPACHADO,
    ]) {
      expect(canTransition(status, OrderStatus.CANCELADO)).toBe(true);
    }
  });

  it("no permite saltarse pasos", () => {
    expect(canTransition(OrderStatus.BORRADOR, OrderStatus.DESPACHADO)).toBe(false);
    expect(canTransition(OrderStatus.BORRADOR, OrderStatus.ENTREGADO)).toBe(false);
    expect(canTransition(OrderStatus.CONFIRMADO, OrderStatus.ENTREGADO)).toBe(false);
  });

  it("no permite retroceder", () => {
    expect(canTransition(OrderStatus.CONFIRMADO, OrderStatus.BORRADOR)).toBe(false);
    expect(canTransition(OrderStatus.DESPACHADO, OrderStatus.EN_PREPARACION)).toBe(false);
  });

  it("trata ENTREGADO y CANCELADO como terminales", () => {
    expect(ALLOWED_TRANSITIONS.ENTREGADO).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELADO).toEqual([]);
    expect(canTransition(OrderStatus.ENTREGADO, OrderStatus.CANCELADO)).toBe(false);
    expect(canTransition(OrderStatus.CANCELADO, OrderStatus.BORRADOR)).toBe(false);
  });
});
