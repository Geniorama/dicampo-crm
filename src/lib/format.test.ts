import { describe, expect, it } from "vitest";
import {
  formatBogotaDateTime,
  formatCalendarDate,
  formatDate,
  formatDateTime,
} from "./format";

/**
 * Deben dar lo mismo con el servidor en UTC (Netlify) o en Bogotá (equipos
 * del equipo): las pruebas se corren con TZ=UTC y con TZ=America/Bogota.
 */
describe("fechas en hora de Bogotá", () => {
  // 7 oct 2026, 02:30 UTC = 6 oct 2026, 21:30 en Bogotá
  const lateEvening = new Date("2026-10-07T02:30:00Z");

  it("un momento se muestra en hora de Bogotá", () => {
    expect(formatDateTime(lateEvening)).toBe("06 oct 2026, 21:30");
    expect(formatDate(lateEvening)).toBe("06 oct 2026");
    expect(formatBogotaDateTime(lateEvening)).toMatch(/6 de oct, 09:30 p/);
  });

  it("una fecha de calendario (medianoche UTC) no se corre al día anterior", () => {
    expect(formatCalendarDate(new Date("2026-10-09T00:00:00Z"))).toBe("09 oct 2026");
    expect(formatCalendarDate("2026-10-09")).toBe("09 oct 2026");
  });

  it("acepta texto y vacíos", () => {
    expect(formatDateTime("2026-10-07T15:00:00Z")).toBe("07 oct 2026, 10:00");
    expect(formatDate(null)).toBe("—");
    expect(formatCalendarDate(undefined)).toBe("—");
  });
});
