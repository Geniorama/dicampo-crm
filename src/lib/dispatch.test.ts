import { describe, expect, it } from "vitest";
import {
  buildPickList,
  googleMapsRoute,
  groupByLocality,
  wazeLink,
  type DispatchOrder,
} from "./dispatch";

const order = (
  orderNumber: number,
  locality: string | null,
  neighborhood: string | null,
  items: DispatchOrder["items"] = [],
  total = 100_000,
): DispatchOrder => ({
  id: `o${orderNumber}`,
  orderNumber,
  clientName: `Cliente ${orderNumber}`,
  locality,
  neighborhood,
  address: null,
  total,
  items,
});

describe("groupByLocality", () => {
  const groups = groupByLocality([
    order(3, "Suba", "El Batán"),
    order(1, "Engativá", "Bonanza"),
    order(2, "ENGATIVA ", "Bonanza"),
    order(4, null, null),
    order(5, "Engativá", "Las Ferias"),
  ]);

  it("junta variantes de escritura y ordena alfabéticamente", () => {
    expect(groups.map((g) => g.locality)).toEqual(["Engativá", "Suba", "Sin localidad"]);
    expect(groups[0].orderCount).toBe(3);
  });

  it("agrupa por barrio dentro de la localidad", () => {
    expect(groups[0].neighborhoods.map((n) => n.neighborhood)).toEqual(["Bonanza", "Las Ferias"]);
    expect(groups[0].neighborhoods[0].orders.map((o) => o.orderNumber)).toEqual([1, 2]);
  });

  it("suma el valor de cada localidad", () => {
    expect(groups[0].total).toBe(300_000);
  });
});

describe("buildPickList", () => {
  it("suma por sabor y presentación, sin mezclar kilos con libras", () => {
    const list = buildPickList([
      order(1, null, null, [
        { name: "Pulpa de Mango", presentation: "KILO", quantity: 2 },
        { name: "Pulpa de Mora", presentation: "KILO", quantity: 1.5 },
      ]),
      order(2, null, null, [
        { name: "Pulpa de Mango", presentation: "KILO", quantity: 3 },
        { name: "Pulpa de Mango", presentation: "LIBRA", quantity: 4 },
      ]),
    ]);

    expect(list).toHaveLength(3);
    const mangoKilo = list.find((l) => l.name === "Pulpa de Mango" && l.presentation === "KILO");
    expect(mangoKilo?.quantity).toBe(5);
    expect(mangoKilo?.orders).toEqual([
      { orderNumber: 1, clientName: "Cliente 1", quantity: 2 },
      { orderNumber: 2, clientName: "Cliente 2", quantity: 3 },
    ]);
  });
});

describe("enlaces de navegación", () => {
  it("Google Maps respeta el orden y agrega la ciudad", () => {
    const route = googleMapsRoute(["Calle 79b # 69r 78", null, "Cra 7 # 77-07"]);
    const url = new URL(route!.url);

    expect(url.searchParams.get("destination")).toBe("Cra 7 # 77-07, Bogotá");
    expect(url.searchParams.get("waypoints")).toBe("Calle 79b # 69r 78, Bogotá");
    expect(route!.truncated).toBe(false);
  });

  it("avisa si hay más paradas de las que admite Maps", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Calle ${i} # 1-1`);
    expect(googleMapsRoute(many)!.truncated).toBe(true);
  });

  it("sin direcciones no hay enlace", () => {
    expect(googleMapsRoute([null, ""])).toBeNull();
    expect(wazeLink(undefined)).toBeNull();
  });

  it("no duplica la ciudad cuando ya viene en la dirección", () => {
    expect(decodeURIComponent(wazeLink("Carrera 9 # 70-34, Bogotá")!)).toContain("70-34, Bogotá&");
  });
});
