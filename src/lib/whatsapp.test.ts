import { describe, expect, it } from "vitest";
import { normalizePhone, whatsappLink } from "./whatsapp";

describe("normalizePhone", () => {
  it("añade el indicativo de país a un celular de 10 dígitos", () => {
    expect(normalizePhone("310 729 6238")).toBe("573107296238");
  });

  it("respeta un número que ya trae indicativo", () => {
    expect(normalizePhone("+57 310 7296238")).toBe("573107296238");
  });

  it("normaliza un fijo de Bogotá con indicativo", () => {
    expect(normalizePhone("(601) 943 95 00")).toBe("576019439500");
  });

  it("asume 601 para un fijo de Bogotá sin indicativo", () => {
    expect(normalizePhone("9439500")).toBe("576019439500");
  });

  it("devuelve null cuando no hay número utilizable", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("sin datos")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("construye el enlace sin mensaje", () => {
    expect(whatsappLink("3107296238")).toBe("https://wa.me/573107296238");
  });

  it("codifica el mensaje prellenado", () => {
    expect(whatsappLink("3107296238", "Hola, ¿cómo estás?")).toBe(
      "https://wa.me/573107296238?text=Hola%2C%20%C2%BFc%C3%B3mo%20est%C3%A1s%3F",
    );
  });

  it("devuelve null si el teléfono no sirve", () => {
    expect(whatsappLink(undefined, "Hola")).toBeNull();
  });
});
