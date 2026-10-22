import { describe, expect, it } from "vitest";
import { productUpdateSchema } from "./catalog";
import { opportunityUpdateSchema } from "./pipeline";
import { orderUpdateSchema } from "./orders";
import { quoteUpdateSchema } from "./quotes";

/**
 * `.partial()` de Zod conserva los `.default()`: sin un cuidado explícito, un
 * PATCH con un solo campo reinicia los demás. Estas pruebas fijan que no pase.
 */
describe("los PATCH parciales no reinician campos con valor por defecto", () => {
  it("producto", () => {
    expect(productUpdateSchema.parse({ description: "x" })).toEqual({ description: "x" });
  });

  it("oportunidad", () => {
    expect(opportunityUpdateSchema.parse({ notes: "x" })).toEqual({ notes: "x" });
  });

  it("pedido", () => {
    expect(orderUpdateSchema.parse({ notes: "x" })).toEqual({ notes: "x" });
  });

  it("cotización", () => {
    expect(quoteUpdateSchema.parse({ notes: "x" })).toEqual({ notes: "x" });
  });
});
