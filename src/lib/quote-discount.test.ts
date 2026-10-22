import { describe, expect, it } from "vitest";
import {
  discountLabel,
  discountPolicy,
  isDiscountAllowed,
  parseNegotiation,
} from "./quote-discount";

describe("discountPolicy", () => {
  const base = { negotiation: null, clientHasHistory: true, addressHasHistory: true };

  it("cliente nuevo: 15 % por defecto, o ninguno", () => {
    const policy = discountPolicy({ ...base, clientHasHistory: false, addressHasHistory: false });
    expect(policy.kind).toBe("NUEVO");
    expect(policy.suggested).toBe(15);
    expect(isDiscountAllowed(policy, 15)).toBe(true);
    expect(isDiscountAllowed(policy, 0)).toBe(true);
    expect(isDiscountAllowed(policy, 10)).toBe(false);
  });

  it("cliente con historial: manual hasta 8 %", () => {
    const policy = discountPolicy(base);
    expect(policy.kind).toBe("MANUAL");
    expect(isDiscountAllowed(policy, 8)).toBe(true);
    expect(isDiscountAllowed(policy, 8.5)).toBe(false);
  });

  it("negociación 15-10: 15 % en la primera compra de la sede y 10 % después", () => {
    const negotiation = { first: 15, next: 10 };
    const first = discountPolicy({ ...base, negotiation, addressHasHistory: false });
    const later = discountPolicy({ ...base, negotiation });

    expect(first.suggested).toBe(15);
    expect(later.suggested).toBe(10);
    // Fija: el vendedor no puede cambiarla.
    expect(isDiscountAllowed(later, 15)).toBe(false);
  });

  it("la negociación manda aunque el cliente sea nuevo", () => {
    const policy = discountPolicy({
      negotiation: { first: 15, next: 5 },
      clientHasHistory: false,
      addressHasHistory: false,
    });
    expect(policy.kind).toBe("NEGOCIACION");
    expect(policy.suggested).toBe(15);
  });
});

describe("textos y lectura", () => {
  it("usa los mismos rótulos que el Excel", () => {
    expect(discountLabel("NUEVO", 15)).toBe("Promo 15% primer pedido");
    expect(discountLabel("NEGOCIACION", 15, { firstOfAddress: true })).toBe(
      "Negociación especial 15% (1er pedido sede)",
    );
    expect(discountLabel("MANUAL", 5)).toBe("Descuento manual 5%");
    expect(discountLabel("MANUAL", 0)).toBe("Sin descuento");
  });

  it("lee la marca de negociación", () => {
    expect(parseNegotiation("15-10")).toEqual({ first: 15, next: 10 });
    expect(parseNegotiation(" 15 - 5 ")).toEqual({ first: 15, next: 5 });
    expect(parseNegotiation("abc")).toBeNull();
    expect(parseNegotiation(null)).toBeNull();
  });
});
