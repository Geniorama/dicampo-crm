import { describe, expect, it } from "vitest";
import { deliveryFailureSchema, deliveryProofSchema } from "./routes";

describe("entrega con cobro", () => {
  it("el cobro es opcional: un cliente a crédito se entrega sin pago", () => {
    const input = deliveryProofSchema.parse({ receivedBy: "Marta Gómez" });
    expect(input.payment).toBeUndefined();
  });

  it("acepta el cobro con su medio y las observaciones libres", () => {
    const input = deliveryProofSchema.parse({
      receivedBy: "Marta Gómez",
      notes: "  Dejé la mercancía en la nevera  ",
      payment: { amount: "150000", method: "TRANSFERENCIA", reference: "  NEQ123 " },
    });

    expect(input.notes).toBe("Dejé la mercancía en la nevera");
    expect(input.payment).toMatchObject({ amount: 150000, method: "TRANSFERENCIA", reference: "NEQ123" });
  });

  it("el medio de pago por defecto es efectivo y el valor debe ser positivo", () => {
    const input = deliveryProofSchema.parse({ receivedBy: "Marta Gómez", payment: { amount: 5000 } });
    expect(input.payment?.method).toBe("EFECTIVO");

    expect(
      deliveryProofSchema.safeParse({ receivedBy: "Marta Gómez", payment: { amount: 0 } }).success,
    ).toBe(false);
  });

  it("exige saber quién recibió", () => {
    expect(deliveryProofSchema.safeParse({ receivedBy: "A" }).success).toBe(false);
  });
});

describe("entrega no completada", () => {
  it("exige un motivo válido; las observaciones son opcionales", () => {
    expect(deliveryFailureSchema.safeParse({}).success).toBe(false);
    expect(deliveryFailureSchema.safeParse({ reason: "INVENTADO" }).success).toBe(false);

    const input = deliveryFailureSchema.parse({ reason: "LOCAL_CERRADO", notes: "  " });
    expect(input.reason).toBe("LOCAL_CERRADO");
    expect(input.notes).toBeUndefined();
  });
});
