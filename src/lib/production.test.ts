import { describe, expect, it } from "vitest";
import {
  batchBreakdown,
  daysOfStock,
  funnel,
  margin,
  purchaseCost,
  stockLevel,
  toKilos,
  weightedCostPerKg,
  yieldFlag,
} from "./production";

describe("compras", () => {
  it("suma 5 % de excipientes al lote", () => {
    // Compra de mango del 3 de mayo: $1.701.000 de fruta.
    expect(purchaseCost(1_620_000)).toBe(1_701_000);
    expect(purchaseCost(1_000)).toBe(1_050);
  });

  it("el costo por kilo se pondera por kilos, no por compra", () => {
    // 600 kg a $2.835 y 580 kg a $2.835 → igual; con precios distintos pesa el lote grande.
    const cost = weightedCostPerKg([
      { kg: 600, cost: 1_701_000 },
      { kg: 580, cost: 1_644_300 },
    ]);
    expect(Math.round(cost!)).toBe(2_835);
    expect(weightedCostPerKg([])).toBeNull();
  });
});

describe("tanda de producción", () => {
  it("calcula desperdicio y rendimiento", () => {
    const result = batchBreakdown(100, 50, 10);
    expect(result).toMatchObject({ pulpKg: 60, wasteKg: 40, yieldPct: 60, wastePct: 40, exceedsFruit: false });
  });

  it("detecta pulpa que pesa más que la fruta", () => {
    const result = batchBreakdown(100, 90, 20);
    expect(result.exceedsFruit).toBe(true);
    expect(result.wasteKg).toBe(0);
  });

  it("sin fruta no hay rendimiento", () => {
    expect(batchBreakdown(0, 0, 0).yieldPct).toBe(0);
  });
});

describe("alertas", () => {
  it("rendimiento 8 puntos bajo lo esperado se revisa (fresa 48 % vs 62 %)", () => {
    expect(yieldFlag(48, 62)).toBe("REVISAR");
    expect(yieldFlag(59, 60)).toBe("NORMAL");
    expect(yieldFlag(33, 34)).toBe("NORMAL");
    expect(yieldFlag(50, null)).toBe("SIN_DATO");
  });

  it("niveles de stock", () => {
    expect(stockLevel(0)).toBe("AGOTADO");
    expect(stockLevel(29)).toBe("BAJO");
    expect(stockLevel(30)).toBe("OK");
  });

  it("días de stock y urgencia", () => {
    expect(daysOfStock(54, 8)).toEqual({ days: 6.8, status: "SANO" });
    expect(daysOfStock(20, 8).status).toBe("PRODUCIR_YA");
    expect(daysOfStock(40, 8).status).toBe("PRONTO");
    expect(daysOfStock(40, 0)).toEqual({ days: null, status: "SIN_VENTAS" });
  });
});

describe("cifras del panel", () => {
  it("embudo de la fruta a lo vendido", () => {
    expect(funnel(4850, 2984, 2610)).toMatchObject({ pulpPct: 62, soldPct: 54 });
  });

  it("margen sobre la venta", () => {
    expect(margin(1000, 400)).toEqual({ cost: 400, sales: 1000, profit: 600, marginPct: 60 });
    expect(margin(0, 400).marginPct).toBeNull();
  });

  it("una libra es medio kilo", () => {
    expect(toKilos(4, "LIBRA")).toBe(2);
    expect(toKilos(4, "KILO")).toBe(4);
  });
});
