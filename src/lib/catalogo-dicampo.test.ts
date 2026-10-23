import { describe, expect, it } from "vitest";
import { buildSku } from "@/server/services/catalog";
import { NET_WEIGHT_G } from "@/server/validators/catalog";
import { BLOCK_500G_FLAVORS, CATALOG } from "../../scripts/datos/catalogo-dicampo";

/** SKU que ya tiene cada sabor en la base de producción (17 productos sembrados). */
const EXISTING_SKUS: Record<string, string> = {
  Mango: "MAN-K",
  Fresa: "FRE-K",
  Lulo: "LUL-K",
  Mora: "MOR-K",
  Guanábana: "GUA-K",
  Maracuyá: "MAR-K",
  Mandarina: "MND-K",
  Uva: "UVA-K",
  Piña: "PIN-K",
  "Frutos Rojos": "FRO-K",
  "Frutos Amarillos": "FAM-K",
  "Piña Colada": "PCO-K",
  Limonada: "LIM-K",
  "Limón Hierbabuena": "LHB-K",
  "Limón Cereza": "LCE-K",
  "Limón Mango Biche": "LMB-K",
  "Limón Coco": "LCO-K",
};

const variants = CATALOG.flatMap((product) => product.variants.map((variant) => ({ product, variant })));

describe("datos del catálogo de Dicampo", () => {
  it("no repite sabores ni SKU", () => {
    const flavors = CATALOG.map((product) => product.flavor);
    const skus = variants.map(({ variant }) => variant.sku);

    expect(new Set(flavors).size).toBe(flavors.length);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("los sabores que ya existen conservan su SKU", () => {
    for (const [flavor, sku] of Object.entries(EXISTING_SKUS)) {
      const product = CATALOG.find((item) => item.flavor === flavor);
      expect(product, flavor).toBeDefined();
      expect(product!.variants[0].sku, flavor).toBe(sku);
    }
  });

  it("cada nivel cuesta igual o más que el anterior (distribuidor ≤ mayorista ≤ público)", () => {
    for (const { variant } of variants) {
      if (!variant.tiers) continue;
      const [distribuidor, mayorista, publico] = variant.tiers;
      expect(distribuidor, variant.sku).toBeLessThanOrEqual(mayorista);
      expect(mayorista, variant.sku).toBeLessThanOrEqual(publico);
      expect(distribuidor, variant.sku).toBeGreaterThan(0);
    }
  });

  it("los zumos usan presentaciones en litros y los demás en kilo (o libra)", () => {
    for (const { product, variant } of variants) {
      if (product.category === "ZUMO") {
        expect(["MEDIO_LITRO", "LITRO", "TRES_LITROS"]).toContain(variant.presentation);
      } else {
        expect(["KILO", "LIBRA"], variant.sku).toContain(variant.presentation);
      }
    }
  });

  it("los SKU coinciden con los que generaría el CRM, salvo los fijados a mano", () => {
    const manual = new Set(["LPN-K", "MIX-K", "NAR-K", "MSE-K", "MDE-K"]);
    for (const { product, variant } of variants) {
      if (product.category === "ZUMO" || manual.has(variant.sku) || EXISTING_SKUS[product.flavor]) continue;
      expect(variant.sku).toBe(buildSku(product.flavor, variant.presentation));
    }
  });

  it("los rendimientos esperados vienen de la app de inventario", () => {
    const yields = Object.fromEntries(
      CATALOG.filter((p) => p.expectedYieldPct).map((p) => [p.flavor, p.expectedYieldPct]),
    );
    expect(yields).toEqual({ Mango: 60, Fresa: 62, Mora: 65, Maracuyá: 34 });
  });

  it("los bloques de 500 g son la libra de sabores que ya existen", () => {
    expect(NET_WEIGHT_G.LIBRA).toBe(500);
    for (const flavor of BLOCK_500G_FLAVORS) {
      expect(CATALOG.some((product) => product.flavor === flavor), flavor).toBe(true);
    }
  });
});
