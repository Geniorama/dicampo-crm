import { describe, expect, it } from "vitest";
import { addressUpdateSchema, clientUpdateSchema } from "./clients";

describe("clientUpdateSchema", () => {
  it("un PATCH parcial no reinicia estado, tipo ni condiciones", () => {
    expect(clientUpdateSchema.parse({ notes: "llamar el lunes" })).toEqual({
      notes: "llamar el lunes",
    });
  });

  it("acepta la forma de facturación", () => {
    expect(clientUpdateSchema.parse({ billingMode: "REMISION" })).toEqual({
      billingMode: "REMISION",
    });
  });
});

describe("addressUpdateSchema", () => {
  it("un PATCH parcial de la sede no reactiva la ciudad ni la marca principal", () => {
    expect(addressUpdateSchema.parse({ locality: "Engativá" })).toEqual({
      locality: "Engativá",
    });
  });
});

describe("contactUpdateSchema", () => {
  it("un PATCH parcial del contacto no le quita lo principal", async () => {
    const { contactUpdateSchema } = await import("./clients");
    expect(contactUpdateSchema.parse({ phone: "3001234567" })).toEqual({
      phone: "3001234567",
    });
  });
});
