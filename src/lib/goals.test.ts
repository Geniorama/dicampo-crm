import { describe, expect, it } from "vitest";
import { currentMonth, daysInMonth, elapsedFraction, goalProgress, monthBounds } from "./goals";

describe("meses en hora de Bogotá", () => {
  it("el 31 a las 8 p. m. de Bogotá sigue siendo ese mes", () => {
    // 01:00 UTC del 1 de noviembre = 8 p. m. del 31 de octubre en Bogotá.
    expect(currentMonth(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });

  it("los límites del mes arrancan a medianoche de Bogotá", () => {
    const { start, end } = monthBounds("2026-10");
    expect(start.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });

  it("un pedido del 31 a las 8 p. m. cae dentro de octubre", () => {
    const { start, end } = monthBounds("2026-10");
    const order = new Date("2026-11-01T01:00:00Z");
    expect(order >= start && order < end).toBe(true);
  });

  it("días del mes, con bisiesto", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
  });
});

describe("elapsedFraction", () => {
  const now = new Date("2026-10-16T17:00:00Z"); // 16 de octubre, mediodía en Bogotá

  it("cuenta el día en curso", () => {
    expect(elapsedFraction("2026-10", now)).toBeCloseTo(16 / 31);
  });

  it("mes pasado completo, mes futuro sin empezar", () => {
    expect(elapsedFraction("2026-09", now)).toBe(1);
    expect(elapsedFraction("2026-11", now)).toBe(0);
  });
});

describe("goalProgress", () => {
  it("sin meta no hay porcentaje", () => {
    expect(goalProgress(0, 500, 0.5).pace).toBe("SIN_META");
    expect(goalProgress(0, 500, 0.5).percent).toBeNull();
  });

  it("compara con el ritmo esperado a mitad de mes", () => {
    expect(goalProgress(1000, 700, 0.5).pace).toBe("ADELANTADO");
    expect(goalProgress(1000, 450, 0.5).pace).toBe("EN_RITMO");
    expect(goalProgress(1000, 200, 0.5).pace).toBe("ATRASADO");
  });

  it("al llegar a la meta queda cumplida aunque falten días", () => {
    const progress = goalProgress(1000, 1200, 0.3);
    expect(progress.pace).toBe("CUMPLIDA");
    expect(progress.percent).toBe(120);
  });
});
