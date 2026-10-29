import { describe, expect, it } from "vitest";
import {
  clampDiscount,
  discountLabel,
  discountPolicy,
  isDiscountAllowed,
  parseNegotiation,
} from "./quote-discount";

describe("discountPolicy", () => {
  const base = { negotiation: null, clientHasHistory: true, addressHasHistory: true };

  it("cliente nuevo: 15 % fijo, sin quitarlo ni sumarle otro", () => {
    const policy = discountPolicy({ ...base, clientHasHistory: false, addressHasHistory: false });
    expect(policy.kind).toBe("NUEVO");
    expect(policy.suggested).toBe(15);
    expect(policy.fixed).toBe(true);
    expect(isDiscountAllowed(policy, 15)).toBe(true);
    expect(isDiscountAllowed(policy, 0)).toBe(false);
    expect(isDiscountAllowed(policy, 23)).toBe(false);
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

  it("el 15 % de cliente nuevo manda aunque tenga negociación", () => {
    const policy = discountPolicy({
      negotiation: { first: 20, next: 5 },
      clientHasHistory: false,
      addressHasHistory: false,
    });
    expect(policy.kind).toBe("NUEVO");
    expect(policy.suggested).toBe(15);
  });

  it("después del primer pedido rige la negociación", () => {
    const policy = discountPolicy({
      negotiation: { first: 20, next: 5 },
      clientHasHistory: true,
      addressHasHistory: false,
    });
    expect(policy.kind).toBe("NEGOCIACION");
    expect(policy.suggested).toBe(20);
    expect(policy.fixed).toBe(false);
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

describe("clampDiscount", () => {
  it("no deja pasar del tope", () => {
    expect(clampDiscount("20", 8)).toBe(8);
    expect(clampDiscount("8.5", 8)).toBe(8);
  });

  it("respeta lo que está dentro del rango", () => {
    expect(clampDiscount("5", 8)).toBe(5);
    expect(clampDiscount("7.5", 8)).toBe(7.5);
  });

  it("vacío, negativo o ilegible es 0", () => {
    expect(clampDiscount("", 8)).toBe(0);
    expect(clampDiscount("-3", 8)).toBe(0);
    expect(clampDiscount("abc", 8)).toBe(0);
  });
});
