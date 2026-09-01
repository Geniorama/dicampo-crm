import { describe, expect, it } from "vitest";
import { allocateFefo, type AllocatableLot } from "./fefo";

/** Lotes en orden de vencimiento: el primero vence antes. */
const lots: AllocatableLot[] = [
  { id: "vence-marzo", available: 10 },
  { id: "vence-abril", available: 20 },
  { id: "vence-mayo", available: 5 },
];

describe("allocateFefo", () => {
  it("consume primero el lote que vence antes", () => {
    const result = allocateFefo(lots, 6);

    expect(result.shortfall).toBe(0);
    expect(result.allocations).toEqual([
      { lotId: "vence-marzo", taken: 6, remaining: 4 },
    ]);
  });

  it("agota un lote antes de pasar al siguiente", () => {
    const result = allocateFefo(lots, 25);

    expect(result.shortfall).toBe(0);
    expect(result.allocations).toEqual([
      { lotId: "vence-marzo", taken: 10, remaining: 0 },
      { lotId: "vence-abril", taken: 15, remaining: 5 },
    ]);
  });

  it("reparte entre los tres lotes cuando hace falta", () => {
    const result = allocateFefo(lots, 35);

    expect(result.shortfall).toBe(0);
    expect(result.allocations.map((a) => a.taken)).toEqual([10, 20, 5]);
    expect(result.allocations.every((a) => a.remaining === 0)).toBe(true);
  });

  it("reporta el faltante sin inventar existencias", () => {
    const result = allocateFefo(lots, 50);

    // 10 + 20 + 5 = 35 disponibles; faltan 15.
    expect(result.shortfall).toBe(15);
    expect(result.allocations.map((a) => a.taken)).toEqual([10, 20, 5]);
  });

  it("ignora los lotes sin saldo", () => {
    const result = allocateFefo(
      [
        { id: "agotado", available: 0 },
        { id: "con-saldo", available: 8 },
      ],
      5,
    );

    expect(result.allocations).toEqual([
      { lotId: "con-saldo", taken: 5, remaining: 3 },
    ]);
  });

  it("no toma nada si no hay lotes", () => {
    expect(allocateFefo([], 10)).toEqual({ allocations: [], shortfall: 10 });
  });

  it("no hace nada con cantidad cero o negativa", () => {
    expect(allocateFefo(lots, 0)).toEqual({ allocations: [], shortfall: 0 });
    expect(allocateFefo(lots, -5)).toEqual({ allocations: [], shortfall: 0 });
  });

  it("maneja cantidades fraccionarias", () => {
    const result = allocateFefo([{ id: "a", available: 2.5 }], 1.5);

    expect(result.allocations).toEqual([
      { lotId: "a", taken: 1.5, remaining: 1 },
    ]);
    expect(result.shortfall).toBe(0);
  });
});
