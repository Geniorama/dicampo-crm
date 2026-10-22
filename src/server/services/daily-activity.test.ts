import { describe, expect, it } from "vitest";
import { bogotaDayBounds } from "./daily-activity";

describe("bogotaDayBounds", () => {
  it("el día de Bogotá empieza a las 05:00 UTC", () => {
    const { start, end } = bogotaDayBounds(new Date("2026-10-22T17:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-22T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-23T05:00:00.000Z");
  });

  it("a las 8 p. m. de Bogotá sigue siendo el mismo día", () => {
    // 01:00 UTC del 23 = 8 p. m. del 22 en Bogotá.
    const { start } = bogotaDayBounds(new Date("2026-10-23T01:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-22T05:00:00.000Z");
  });
});
