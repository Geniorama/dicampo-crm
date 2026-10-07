import { afterEach, describe, expect, it, vi } from "vitest";
import { businessDateSchema, endOfBusinessDay, localDateSchema, reportQuerySchema } from "./reports";

afterEach(() => {
  vi.useRealTimers();
});

describe("rangos en hora de Bogotá", () => {
  it("una fecha del filtro es la medianoche de Bogotá (05:00 UTC)", () => {
    expect(localDateSchema.parse("2026-10-07").toISOString()).toBe("2026-10-07T05:00:00.000Z");
  });

  it("el fin del día es el de Bogotá", () => {
    expect(endOfBusinessDay(new Date("2026-10-07T05:00:00Z")).toISOString()).toBe(
      "2026-10-08T04:59:59.999Z",
    );
  });

  it("'este mes' arranca el día 1 en Bogotá aunque en UTC ya sea otro mes", () => {
    // 31 oct, 9 p. m. en Bogotá = 1 nov, 02:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const query = reportQuerySchema.parse({ period: "ESTE_MES" });
    expect(query.rangeFrom.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(query.rangeTo.toISOString()).toBe("2026-11-01T04:59:59.999Z");
  });

  it("mes anterior y rango personalizado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
    const previous = reportQuerySchema.parse({ period: "MES_ANTERIOR" });
    expect(previous.rangeFrom.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(previous.rangeTo.toISOString()).toBe("2026-10-01T04:59:59.999Z");

    const custom = reportQuerySchema.parse({ period: "PERSONALIZADO", from: "2026-10-01", to: "2026-10-15" });
    expect(custom.rangeFrom.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(custom.rangeTo.toISOString()).toBe("2026-10-16T04:59:59.999Z");
  });
});

describe("businessDateSchema (fecha compromiso de una actividad)", () => {
  it("un día sin hora es el inicio de ese día en Bogotá", () => {
    expect(businessDateSchema.parse("2026-10-09").toISOString()).toBe("2026-10-09T05:00:00.000Z");
  });

  it("una fecha con hora se respeta", () => {
    expect(businessDateSchema.parse("2026-10-09T15:00:00Z").toISOString()).toBe(
      "2026-10-09T15:00:00.000Z",
    );
  });
});
