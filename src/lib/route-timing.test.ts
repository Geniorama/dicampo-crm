import { describe, expect, it } from "vitest";
import { computeRouteTiming, formatDuration } from "./route-timing";

const at = (hhmm: string) => new Date(`2026-10-26T${hhmm}:00Z`);

describe("tiempos del recorrido", () => {
  it("separa trayecto y tiempo en sitio de cada parada", () => {
    const timing = computeRouteTiming(at("08:00"), [
      { id: "a", arrivedAt: at("08:20"), closedAt: at("08:35") },
      { id: "b", arrivedAt: at("08:50"), closedAt: at("09:00") },
    ]);

    expect(timing.stops[0]).toEqual({ id: "a", travelMs: 20 * 60_000, onSiteMs: 15 * 60_000 });
    // El trayecto de la segunda cuenta desde que se cerró la primera.
    expect(timing.stops[1]).toEqual({ id: "b", travelMs: 15 * 60_000, onSiteMs: 10 * 60_000 });
    expect(timing.travelMs).toBe(35 * 60_000);
    expect(timing.onSiteMs).toBe(25 * 60_000);
    expect(timing.totalMs).toBe(60 * 60_000);
  });

  it("con paradas pendientes el total corre hasta ahora", () => {
    const timing = computeRouteTiming(
      at("08:00"),
      [
        { id: "a", arrivedAt: at("08:20"), closedAt: at("08:35") },
        { id: "b", arrivedAt: null, closedAt: null },
      ],
      at("08:45"),
    );

    expect(timing.stops[1]).toEqual({ id: "b", travelMs: null, onSiteMs: null });
    expect(timing.totalMs).toBe(45 * 60_000);
  });

  it("sin salida registrada no inventa tiempos", () => {
    const timing = computeRouteTiming(null, [
      { id: "a", arrivedAt: at("08:20"), closedAt: at("08:35") },
    ]);

    expect(timing.stops[0].travelMs).toBeNull();
    expect(timing.stops[0].onSiteMs).toBe(15 * 60_000);
    expect(timing.totalMs).toBeNull();
  });

  it("un reloj atrasado no produce tiempos negativos", () => {
    const timing = computeRouteTiming(at("08:30"), [
      { id: "a", arrivedAt: at("08:20"), closedAt: at("08:25") },
    ]);

    expect(timing.stops[0].travelMs).toBeNull();
  });
});

describe("formatDuration", () => {
  it("escribe minutos y horas", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(20_000)).toBe("< 1 min");
    expect(formatDuration(45 * 60_000)).toBe("45 min");
    expect(formatDuration(60 * 60_000)).toBe("1 h");
    expect(formatDuration(90 * 60_000)).toBe("1 h 30 min");
  });
});
