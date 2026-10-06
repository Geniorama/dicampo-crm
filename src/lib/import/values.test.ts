import { describe, expect, it } from "vitest";
import {
  matchEnum,
  normalizeKey,
  parseBoolean,
  parseDateValue,
  parseDecimal,
} from "./values";
import { CLIENT_TYPE_LABEL, PAYMENT_TERMS_LABEL } from "@/lib/labels";

describe("normalizeKey", () => {
  it("ignora acentos, mayúsculas y signos", () => {
    expect(normalizeKey("Razón Social ")).toBe("razonsocial");
    expect(normalizeKey("N.I.T.")).toBe("nit");
    expect(normalizeKey("Teléfono / Celular")).toBe("telefonocelular");
  });
});

describe("parseDecimal", () => {
  it("lee el formato colombiano", () => {
    expect(parseDecimal("1.500.000,50")).toBe(1500000.5);
    expect(parseDecimal("$ 12.500")).toBe(12500);
    expect(parseDecimal("12,5")).toBe(12.5);
  });

  it("lee también el formato inglés", () => {
    expect(parseDecimal("1,234,567.89")).toBeCloseTo(1234567.89);
    expect(parseDecimal("1,234,567")).toBe(1234567);
  });

  it("resuelve el punto ambiguo por la forma del número", () => {
    // Tres dígitos detrás del punto: separador de miles.
    expect(parseDecimal("1.234")).toBe(1234);
    // Cualquier otra cantidad: decimal.
    expect(parseDecimal("1.5")).toBe(1.5);
    // Detrás de un cero nadie escribe miles.
    expect(parseDecimal("0.190")).toBe(0.19);
  });

  it("entiende los negativos entre paréntesis de contabilidad", () => {
    expect(parseDecimal("(1.000)")).toBe(-1000);
    expect(parseDecimal("-250")).toBe(-250);
  });

  it("devuelve null si la celda no es un número", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("mil quinientos")).toBeNull();
    expect(parseDecimal("12 unidades")).toBeNull();
  });
});

describe("parseBoolean", () => {
  it("reconoce las formas en que se escribe un sí", () => {
    for (const value of ["Sí", "si", "X", "1", "VERDADERO", "Activo"]) {
      expect(parseBoolean(value)).toBe(true);
    }
  });

  it("reconoce las formas en que se escribe un no", () => {
    for (const value of ["No", "0", "FALSO", "Inactivo"]) {
      expect(parseBoolean(value)).toBe(false);
    }
  });

  it("devuelve null ante cualquier otra cosa", () => {
    expect(parseBoolean("tal vez")).toBeNull();
    expect(parseBoolean("")).toBeNull();
  });
});

describe("parseDateValue", () => {
  it("lee la fecha en hora local, no en UTC", () => {
    const date = parseDateValue("2026-09-05");

    // El error clásico: `new Date("2026-09-05")` en Bogotá daría el día 4.
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(5);
    expect(date?.getHours()).toBe(0);
  });

  it("acepta el día primero, que es como se escribe en Colombia", () => {
    const date = parseDateValue("05/09/2026");

    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(5);
  });

  it("expande el año de dos cifras", () => {
    expect(parseDateValue("05/09/26")?.getFullYear()).toBe(2026);
    expect(parseDateValue("05/09/98")?.getFullYear()).toBe(1998);
  });

  it("lee el serial de Excel", () => {
    const serial = Math.round(
      (Date.UTC(2026, 8, 5) - Date.UTC(1899, 11, 30)) / 86_400_000,
    );

    const date = parseDateValue(String(serial));

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(8);
    expect(date?.getDate()).toBe(5);
  });

  it("rechaza los días que no existen en vez de rebotarlos al mes siguiente", () => {
    expect(parseDateValue("31/02/2026")).toBeNull();
    expect(parseDateValue("mañana")).toBeNull();
  });
});

describe("matchEnum", () => {
  it("acepta la etiqueta de la interfaz y la clave del enum", () => {
    expect(matchEnum("Panadería", CLIENT_TYPE_LABEL)).toBe("PANADERIA");
    expect(matchEnum("PANADERIA", CLIENT_TYPE_LABEL)).toBe("PANADERIA");
    expect(matchEnum("panaderia", CLIENT_TYPE_LABEL)).toBe("PANADERIA");
  });

  it("tolera que falte parte de la etiqueta", () => {
    expect(matchEnum("Crédito 30", PAYMENT_TERMS_LABEL)).toBe("CREDITO_30");
  });

  it("devuelve null si no corresponde a ningún valor", () => {
    expect(matchEnum("Ferretería", CLIENT_TYPE_LABEL)).toBeNull();
    expect(matchEnum("", CLIENT_TYPE_LABEL)).toBeNull();
  });
});
