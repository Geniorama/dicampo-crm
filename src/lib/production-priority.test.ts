import { describe, expect, it } from "vitest";
import { productionPriority } from "./production-priority";

describe("productionPriority", () => {
  it("sin stock es prioridad alta", () => {
    expect(productionPriority({ physicalKg: 0, availableKg: 0, unreservedKg: 0 })).toEqual({
      priority: "ALTA",
      reason: "SIN_STOCK",
    });
  });

  it("más pedidos sin reservar que stock libre es prioridad alta", () => {
    expect(productionPriority({ physicalKg: 120, availableKg: 80, unreservedKg: 90 })?.priority).toBe("ALTA");
  });

  it("menos de 50 kg en bodega es prioridad media", () => {
    expect(productionPriority({ physicalKg: 40, availableKg: 40, unreservedKg: 0 })).toEqual({
      priority: "MEDIA",
      reason: "POCO_STOCK",
    });
  });

  it("menos de 50 kg después de despachar es prioridad media", () => {
    expect(productionPriority({ physicalKg: 200, availableKg: 30, unreservedKg: 0 })).toEqual({
      priority: "MEDIA",
      reason: "POCO_TRAS_DESPACHO",
    });
  });

  it("con stock suficiente no aparece", () => {
    expect(productionPriority({ physicalKg: 200, availableKg: 150, unreservedKg: 10 })).toBeNull();
  });
});
