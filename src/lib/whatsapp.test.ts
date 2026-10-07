import { describe, expect, it } from "vitest";
import { contactWhatsappKey, normalizePhone, whatsappLink } from "./whatsapp";

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

describe("contactWhatsappKey", () => {
  it("usa el WhatsApp del contacto, normalizado", () => {
    expect(
      contactWhatsappKey({ whatsapp: "+57 310 729 6238", phone: "6019439500" }),
    ).toBe("573107296238");
  });

  it("recurre al teléfono si no hay WhatsApp", () => {
    expect(contactWhatsappKey({ whatsapp: null, phone: "310 729 6238" })).toBe(
      "573107296238",
    );
  });

  it("recurre al teléfono si el WhatsApp no es un número utilizable", () => {
    expect(contactWhatsappKey({ whatsapp: "pendiente", phone: "3107296238" })).toBe(
      "573107296238",
    );
  });

  it("da la misma llave para el mismo número escrito distinto", () => {
    const formats = ["310 729 6238", "+57 3107296238", "57-310-729-6238", "(310) 7296238"];
    const keys = formats.map((whatsapp) => contactWhatsappKey({ whatsapp }));
    expect(new Set(keys)).toEqual(new Set(["573107296238"]));
  });

  it("devuelve null si no hay ningún número", () => {
    expect(contactWhatsappKey({})).toBeNull();
  });
});
