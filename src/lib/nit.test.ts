import { describe, expect, it } from "vitest";
import { calculateNitDv, isValidNit, onlyDigits } from "./nit";

describe("onlyDigits", () => {
  it("descarta separadores y guiones", () => {
    expect(onlyDigits("900.123.456-7")).toBe("9001234567");
  });
});

describe("calculateNitDv", () => {
  // NIT reales de referencia con su dígito de verificación conocido.
  it.each([
    ["899999061", "9"], // Ministerio de Hacienda
    ["860002964", "4"], // Bancolombia
    ["830053105", "3"],
  ])("calcula el DV de %s", (nit, expected) => {
    expect(calculateNitDv(nit)).toBe(expected);
  });

  it("acepta el NIT con formato y llega al mismo resultado", () => {
    expect(calculateNitDv("899.999.061")).toBe("9");
  });

  it("devuelve null si no hay dígitos", () => {
    expect(calculateNitDv("")).toBeNull();
    expect(calculateNitDv("abc")).toBeNull();
  });

  it("devuelve null si el NIT excede la longitud soportada", () => {
    expect(calculateNitDv("1".repeat(16))).toBeNull();
  });
});

describe("isValidNit", () => {
  it("acepta la combinación correcta", () => {
    expect(isValidNit("899999061", "9")).toBe(true);
  });

  it("rechaza un DV que no corresponde", () => {
    expect(isValidNit("899999061", "1")).toBe(false);
  });
});
