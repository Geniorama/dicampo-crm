import { describe, expect, it } from "vitest";
import {
  bogotaMoment,
  conflictsWith,
  formatDayLabel,
  formatHour,
  freeSlots,
  toBogotaIso,
  visitDays,
  visitRuleViolation,
} from "./visit-schedule";

// Miércoles 14 de octubre de 2026, 10:00 a. m. en Bogotá.
const now = new Date("2026-10-14T15:00:00Z");
const at = (iso: string) => new Date(iso);

describe("visitRuleViolation", () => {
  it("acepta un día hábil dentro del horario, desde mañana", () => {
    expect(visitRuleViolation(at("2026-10-15T09:00:00-05:00"), now)).toBeNull();
    expect(visitRuleViolation(at("2026-10-16T15:30:00-05:00"), now)).toBeNull();
  });

  it("rechaza sábados y domingos", () => {
    expect(visitRuleViolation(at("2026-10-17T10:00:00-05:00"), now)).toMatch(/lunes a viernes/);
    expect(visitRuleViolation(at("2026-10-18T10:00:00-05:00"), now)).toMatch(/lunes a viernes/);
  });

  it("rechaza fuera de 9:00 a. m. – 4:00 p. m. (la última empieza 3:30 p. m.)", () => {
    expect(visitRuleViolation(at("2026-10-15T08:30:00-05:00"), now)).toMatch(/3:30 p. m./);
    expect(visitRuleViolation(at("2026-10-15T15:45:00-05:00"), now)).not.toBeNull();
    expect(visitRuleViolation(at("2026-10-15T16:00:00-05:00"), now)).not.toBeNull();
  });

  it("no agenda para el mismo día ni con más de 30 días", () => {
    expect(visitRuleViolation(at("2026-10-14T14:00:00-05:00"), now)).toMatch(/día hábil siguiente/);
    expect(visitRuleViolation(at("2026-11-20T10:00:00-05:00"), now)).toMatch(/30 días/);
  });

  it("usa la hora de Bogotá aunque la fecha llegue en UTC", () => {
    // 2026-10-16T02:00Z es jueves 15 a las 9:00 p. m. en Bogotá: fuera de horario.
    expect(visitRuleViolation(at("2026-10-16T02:00:00Z"), now)).not.toBeNull();
    expect(visitRuleViolation(at("2026-10-15T14:00:00Z"), now)).toBeNull();
  });
});

describe("agenda del asesor", () => {
  it("deja 30 min de visita + 30 de traslado entre visitas", () => {
    const busy = [at("2026-10-15T10:00:00-05:00")];
    expect(conflictsWith(at("2026-10-15T10:30:00-05:00"), busy)).toBe(true);
    expect(conflictsWith(at("2026-10-15T09:30:00-05:00"), busy)).toBe(true);
    expect(conflictsWith(at("2026-10-15T11:00:00-05:00"), busy)).toBe(false);
    expect(conflictsWith(at("2026-10-15T09:00:00-05:00"), busy)).toBe(false);
  });

  it("ofrece franjas de 9:00 a 3:30 cada 30 min, sin las ocupadas", () => {
    const all = freeSlots("2026-10-15", [], now).map(toBogotaIso);
    expect(all).toHaveLength(14);
    expect(all[0]).toBe("2026-10-15T09:00:00-05:00");
    expect(all.at(-1)).toBe("2026-10-15T15:30:00-05:00");

    const withBusy = freeSlots("2026-10-15", [at("2026-10-15T10:00:00-05:00")], now).map(toBogotaIso);
    expect(withBusy).not.toContain("2026-10-15T09:30:00-05:00");
    expect(withBusy).not.toContain("2026-10-15T10:00:00-05:00");
    expect(withBusy).not.toContain("2026-10-15T10:30:00-05:00");
    expect(withBusy).toContain("2026-10-15T11:00:00-05:00");
    expect(freeSlots("2026-10-17", [], now)).toEqual([]);
  });

  it("lista días hábiles desde mañana, saltando el fin de semana", () => {
    expect(visitDays(3, undefined, now)).toEqual(["2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(visitDays(2, "2026-10-17", now)).toEqual(["2026-10-19", "2026-10-20"]);
    expect(visitDays(1, "2026-10-14", now)).toEqual(["2026-10-15"]);
  });
});

describe("formato", () => {
  it("escribe horas y días en español", () => {
    expect(formatHour(9 * 60)).toBe("9:00 a. m.");
    expect(formatHour(15 * 60 + 30)).toBe("3:30 p. m.");
    expect(formatHour(12 * 60)).toBe("12:00 p. m.");
    expect(formatDayLabel("2026-10-19")).toBe("lunes 19 de octubre");
    expect(toBogotaIso(bogotaMoment("2026-10-19", 9 * 60))).toBe("2026-10-19T09:00:00-05:00");
  });
});
