import { describe, expect, it } from "vitest";
import { nextDeliveryDay, zoneForLocality } from "./delivery-zones";

describe("zona de una localidad", () => {
  it("ubica las localidades de Bogotá sin importar tildes ni mayúsculas", () => {
    expect(zoneForLocality("Engativá")).toBe("NORTE_R1");
    expect(zoneForLocality("engativa")).toBe("NORTE_R1");
    expect(zoneForLocality(" CHAPINERO ")).toBe("NORTE_R2");
    expect(zoneForLocality("Kennedy")).toBe("SUR_R1");
    expect(zoneForLocality("Ciudad Bolívar")).toBe("SUR_R2");
    expect(zoneForLocality("Mosquera")).toBe("CUNDINAMARCA");
  });

  it("lo que no está en las listas es Nacional y sin localidad no hay zona", () => {
    expect(zoneForLocality("Santa Marta")).toBe("NACIONAL");
    expect(zoneForLocality("Cali")).toBe("NACIONAL");
    expect(zoneForLocality(null)).toBeNull();
    expect(zoneForLocality("  ")).toBeNull();
  });
});

describe("día de entrega", () => {
  it("es el día siguiente, saltando el domingo", () => {
    expect(nextDeliveryDay("2026-11-04")).toBe("2026-11-05"); // miércoles
    expect(nextDeliveryDay("2026-11-07")).toBe("2026-11-09"); // sábado → lunes
    expect(nextDeliveryDay("2026-11-08")).toBe("2026-11-09"); // domingo
  });
});
