import { describe, expect, it } from "vitest";
import { bogotaWeekday, computePurchaseProfile } from "./purchase-profile";

// Mediodía en Bogotá (UTC-5) para que ninguna zona del servidor cambie el día.
const at = (iso: string) => new Date(`${iso}T17:00:00Z`);

describe("computePurchaseProfile", () => {
  it("sin pedidos devuelve un perfil vacío", () => {
    const profile = computePurchaseProfile([]);
    expect(profile.orderCount).toBe(0);
    expect(profile.lastOrderAt).toBeNull();
    expect(profile.habitualOrder).toEqual([]);
  });

  it("calcula frecuencia, día habitual y ticket", () => {
    const profile = computePurchaseProfile([
      { orderDate: at("2026-09-07"), total: 200_000, items: [{ name: "Mango", quantity: 2 }] },
      { orderDate: at("2026-09-14"), total: 100_000, items: [{ name: "Mango", quantity: 3 }] },
      { orderDate: at("2026-09-21"), total: 300_000, items: [{ name: "Mango", quantity: 2.5 }] },
    ]);

    expect(profile.orderCount).toBe(3);
    expect(profile.avgIntervalDays).toBe(7);
    // 7, 14 y 21 de septiembre de 2026 son lunes.
    expect(profile.usualWeekdays).toEqual([1]);
    expect(profile.avgTicket).toBe(200_000);
  });

  it("el pedido habitual ignora lo que se pidió una sola vez", () => {
    const profile = computePurchaseProfile([
      { orderDate: at("2026-09-01"), total: 1, items: [{ name: "Mora", quantity: 2 }, { name: "Uva", quantity: 9 }] },
      { orderDate: at("2026-09-08"), total: 1, items: [{ name: "Mora", quantity: 3 }] },
      { orderDate: at("2026-09-15"), total: 1, items: [{ name: "Mora", quantity: 2 }] },
    ]);

    expect(profile.habitualOrder).toEqual([{ name: "Mora", quantity: 2.5 }]);
    expect(profile.topFlavors[0]).toBe("Uva");
  });

  it("un pedido a las 8 p. m. de Bogotá cuenta en ese día, no en el siguiente", () => {
    // 01:00 UTC del martes = 8 p. m. del lunes en Bogotá.
    expect(bogotaWeekday(new Date("2026-09-08T01:00:00Z"))).toBe(1);
  });
});
