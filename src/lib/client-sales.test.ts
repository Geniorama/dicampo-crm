import { describe, expect, it } from "vitest";
import {
  bogotaMonthKey,
  computeSalesStats,
  includesDay,
  monthRange,
  parseDays,
} from "./client-sales";

describe("computeSalesStats", () => {
  const base = { count: 10, total: 1_000_000, lastOrderAt: new Date("2026-11-03T17:00:00Z") };

  it("sin pedidos nuevos conserva el corte de la base", () => {
    expect(computeSalesStats(base, [])).toEqual({
      orderCount: 10,
      avgTicket: 100_000,
      lastOrderAt: base.lastOrderAt,
    });
  });

  it("suma solo los pedidos posteriores al corte", () => {
    const stats = computeSalesStats(base, [
      { orderDate: new Date("2026-10-20T17:00:00Z"), total: 999 }, // ya venía en el Excel
      { orderDate: new Date("2026-11-10T15:00:00Z"), total: 200_000 },
    ]);
    expect(stats.orderCount).toBe(11);
    expect(stats.avgTicket).toBeCloseTo(109_090.91, 2);
    expect(stats.lastOrderAt).toEqual(new Date("2026-11-10T15:00:00Z"));
  });

  it("sin base ni pedidos devuelve ceros", () => {
    expect(computeSalesStats({ count: 0, total: 0, lastOrderAt: null }, [])).toEqual({
      orderCount: 0,
      avgTicket: 0,
      lastOrderAt: null,
    });
  });
});

describe("meses en hora de Bogotá", () => {
  it("un pedido de las 8 p. m. del 31 cuenta en ese mes", () => {
    expect(bogotaMonthKey(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });

  it("el rango empieza a medianoche de Bogotá", () => {
    const range = monthRange("2026-11");
    expect(range?.from.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(range?.to.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(monthRange("2026-13")).toBeNull();
  });
});

describe("días", () => {
  it("lee varios días con tildes", () => {
    expect(parseDays("Miércoles / Sábado")).toEqual(["Miércoles", "Sábado"]);
    expect(parseDays("miercoles")).toEqual(["Miércoles"]);
    expect(parseDays(null)).toEqual([]);
  });

  it("incluye el día pedido", () => {
    expect(includesDay("Lunes / Martes", "Martes")).toBe(true);
    expect(includesDay("Lunes", "Martes")).toBe(false);
  });
});
