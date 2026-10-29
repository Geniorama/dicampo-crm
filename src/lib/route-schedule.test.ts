import { describe, expect, it } from "vitest";
import { isoWeekday, scheduledDates } from "./route-schedule";

describe("isoWeekday", () => {
  it("numera lunes como 1 y domingo como 7", () => {
    expect(isoWeekday("2026-10-26")).toBe(1);
    expect(isoWeekday("2026-10-31")).toBe(6);
    expect(isoWeekday("2026-11-01")).toBe(7);
  });
});

describe("scheduledDates", () => {
  it("lista cada sábado dentro del horizonte, incluido el último día", () => {
    expect(scheduledDates(6, "2026-01-01", "2026-10-29", 14)).toEqual([
      "2026-10-31",
      "2026-11-07",
    ]);
    expect(scheduledDates(6, "2026-01-01", "2026-10-31", 14)).toEqual([
      "2026-10-31",
      "2026-11-07",
      "2026-11-14",
    ]);
  });

  it("no genera fechas anteriores al inicio de la programación", () => {
    expect(scheduledDates(6, "2026-11-07", "2026-10-29", 14)).toEqual(["2026-11-07"]);
  });

  it("no genera nada si la programación empieza después del horizonte", () => {
    expect(scheduledDates(6, "2027-01-02", "2026-10-29", 14)).toEqual([]);
  });
});
