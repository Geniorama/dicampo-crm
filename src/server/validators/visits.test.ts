import { describe, expect, it } from "vitest";
import { visitCreateSchema } from "./visits";

const when = { visitDate: "2026-11-10", visitTime: "09:30" };

describe("visitCreateSchema", () => {
  const nuevo = {
    kind: "NUEVO" as const,
    ...when,
    businessName: "Café La Esquina",
    contactName: "Marta",
    locality: "Chapinero",
    address: "Calle 60 # 10-20",
    sampleQuantity: 2,
    sampleFlavor: "Mango",
  };

  it("acepta una visita a cliente nuevo completa", () => {
    expect(visitCreateSchema.safeParse(nuevo).success).toBe(true);
  });

  it("exige la muestra, la localidad y el contacto en cliente nuevo", () => {
    expect(visitCreateSchema.safeParse({ ...nuevo, sampleFlavor: "" }).success).toBe(false);
    expect(visitCreateSchema.safeParse({ ...nuevo, locality: "" }).success).toBe(false);
    expect(visitCreateSchema.safeParse({ ...nuevo, contactName: "" }).success).toBe(false);
  });

  it("fidelización pide cliente y uno de los cuatro motivos", () => {
    const base = { kind: "FIDELIZACION" as const, ...when, clientId: "cm0000000000000000000000" };
    expect(visitCreateSchema.safeParse({ ...base, reason: "RECUPERACION" }).success).toBe(true);
    expect(visitCreateSchema.safeParse({ ...base, reason: "OTRO" }).success).toBe(false);
  });

  it("exige hora de visita", () => {
    expect(visitCreateSchema.safeParse({ ...nuevo, visitTime: "" }).success).toBe(false);
  });

  it("acepta una categoria opcional y rechaza una desconocida", () => {
    expect(visitCreateSchema.safeParse({ ...nuevo, category: "RECUPERACION" }).success).toBe(true);
    expect(visitCreateSchema.safeParse({ ...nuevo, category: "INVENTADA" }).success).toBe(false);
  });

  it("acepta el asesor a cuyo nombre se agenda", () => {
    expect(visitCreateSchema.safeParse({ ...nuevo, advisorId: "cm0000000000000000000000" }).success).toBe(true);
    expect(visitCreateSchema.safeParse({ ...nuevo, advisorId: "no-es-un-id" }).success).toBe(false);
  });
});
