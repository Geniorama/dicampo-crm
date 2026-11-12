import { describe, expect, it } from "vitest";
import {
  advisorEmail,
  calendarToNoonBogota,
  cleanDay,
  daysForZone,
  firstNameKey,
  isUnassigned,
  parseMasterNit,
  parseRelationStatus,
} from "./master-base";

describe("libro maestro", () => {
  it("quita el dígito de verificación del NIT", () => {
    expect(parseMasterNit("901799112-4")).toBe("901799112");
    expect(parseMasterNit("52028678")).toBe("52028678");
    expect(parseMasterNit("")).toBeNull();
    expect(parseMasterNit("12")).toBeNull();
  });

  it("traduce el estado del cliente", () => {
    expect(parseRelationStatus("Cliente activo")).toBe("ACTIVO");
    expect(parseRelationStatus("Por recuperar")).toBe("POR_RECUPERAR");
    expect(parseRelationStatus("En alerta")).toBe("EN_ALERTA");
    expect(parseRelationStatus("otro")).toBeNull();
  });

  it("reconstruye los días desde la zona cuando falta la fórmula", () => {
    expect(daysForZone("Zona 3 – Sur Ruta 1")).toEqual({ delivery: "Jueves", order: "Miércoles" });
    expect(daysForZone("Zona 6 – Nacional")).toBeNull();
    expect(cleanDay('{"formula":"IFERROR(...)"}')).toBeNull();
    expect(cleanDay("Viernes")).toBe("Viernes");
  });

  it("cruza asesores por el primer nombre", () => {
    expect(firstNameKey("Fabián Rojas")).toBe("fabian");
    expect(advisorEmail("Karen")).toBe("karen@dicampo.co");
    expect(isUnassigned("Sin asignar")).toBe(true);
    expect(isUnassigned("Jessica")).toBe(false);
  });

  it("guarda la fecha de calendario al mediodía de Bogotá", () => {
    expect(calendarToNoonBogota(new Date("2026-11-04T00:00:00Z")).toISOString()).toBe(
      "2026-11-04T17:00:00.000Z",
    );
  });
});
