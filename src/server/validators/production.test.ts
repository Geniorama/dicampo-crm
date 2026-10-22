import { describe, expect, it } from "vitest";
import { batchCreateSchema } from "./production";
import { returnSchema } from "./inventory";

const base = {
  productId: "cm0000000000000000000000",
  date: "2026-10-22",
  fruitKg: 100,
  publicKg: 50,
  bulkKg: 10,
  expiryDate: "2027-10-22",
};

describe("batchCreateSchema", () => {
  it("acepta una tanda coherente", () => {
    expect(batchCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza pulpa que pesa más que la fruta", () => {
    const result = batchCreateSchema.safeParse({ ...base, publicKg: 95, bulkKg: 10 });
    expect(result.success).toBe(false);
  });

  it("exige vencimiento si hay pulpa pública, y no si todo es granel", () => {
    expect(batchCreateSchema.safeParse({ ...base, expiryDate: undefined }).success).toBe(false);
    expect(
      batchCreateSchema.safeParse({ ...base, publicKg: 0, bulkKg: 40, expiryDate: undefined }).success,
    ).toBe(true);
  });

  it("exige repartir algo de pulpa", () => {
    expect(batchCreateSchema.safeParse({ ...base, publicKg: 0, bulkKg: 0 }).success).toBe(false);
  });
});

describe("returnSchema", () => {
  const input = { variantId: "cm0000000000000000000000", quantity: 2, condition: "VENDIBLE" as const };

  it("una devolución vendible necesita el lote al que reingresa", () => {
    expect(returnSchema.safeParse(input).success).toBe(false);
    expect(returnSchema.safeParse({ ...input, lotId: "cm0000000000000000000001" }).success).toBe(true);
  });

  it("una dañada no necesita lote", () => {
    expect(returnSchema.safeParse({ ...input, condition: "DANADA" }).success).toBe(true);
  });
});
