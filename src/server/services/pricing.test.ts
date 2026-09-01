import { describe, expect, it } from "vitest";
import { pickTier, type PriceTier } from "./pricing";

const tiers: PriceTier[] = [
  { minQty: 1, price: 12_000 },
  { minQty: 10, price: 11_000 },
  { minQty: 50, price: 10_000 },
];

describe("pickTier", () => {
  it("usa el escalón base para cantidades pequeñas", () => {
    expect(pickTier(tiers, 1)?.price).toBe(12_000);
    expect(pickTier(tiers, 9)?.price).toBe(12_000);
  });

  it("aplica el descuento por volumen al alcanzar el mínimo", () => {
    expect(pickTier(tiers, 10)?.price).toBe(11_000);
    expect(pickTier(tiers, 49)?.price).toBe(11_000);
    expect(pickTier(tiers, 50)?.price).toBe(10_000);
  });

  it("elige el escalón más alto alcanzado, sin importar el orden de entrada", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    expect(pickTier(shuffled, 100)?.price).toBe(10_000);
  });

  it("devuelve null si la cantidad no alcanza ningún escalón", () => {
    expect(pickTier([{ minQty: 5, price: 9_000 }], 4)).toBeNull();
  });

  it("devuelve null si no hay escalones", () => {
    expect(pickTier([], 10)).toBeNull();
  });
});
