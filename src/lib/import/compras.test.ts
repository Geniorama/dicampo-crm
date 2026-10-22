import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { purchaseCost } from "../production";
import { parseDelimited } from "./csv";
import { IMPORT_ENTITIES } from "./entities";
import { missingRequired, readMappedRow, suggestMapping } from "./mapping";
import { parseDateValue, parseDecimal } from "./values";

const compras = IMPORT_ENTITIES.compras;
const file = readFileSync("scripts/datos/compras-iniciales.csv", "utf8");

describe("archivo inicial de compras de fruta", () => {
  const table = parseDelimited(file, { maxRows: 2000 });
  const mapping = suggestMapping(table.headers, compras.fields);

  it("se lee con el separador de Excel en español y 11 compras", () => {
    expect(table.delimiter).toBe(";");
    expect(table.rows).toHaveLength(11);
  });

  it("el cotejo automático cubre todos los campos obligatorios", () => {
    expect(missingRequired(mapping, compras.fields)).toEqual([]);
  });

  it("cada fila se lee completa y con fecha de calendario", () => {
    for (const row of table.rows) {
      const record = readMappedRow(row, mapping);
      expect(parseDateValue(record.date)).not.toBeNull();
      expect(parseDecimal(record.kg)).toBeGreaterThan(0);
      expect(parseDecimal(record.baseCost)).toBeGreaterThan(0);
    }
  });

  it("el costo con excipientes reproduce el de la app de inventario", () => {
    // Mango del 3 de mayo: $1.620.000 del lote + 5 % = $1.701.000 en la app.
    const [first] = table.rows;
    const record = readMappedRow(first, mapping);
    expect(purchaseCost(parseDecimal(record.baseCost)!)).toBe(1_701_000);

    const total = table.rows.reduce(
      (sum, row) => sum + purchaseCost(parseDecimal(readMappedRow(row, mapping).baseCost)!),
      0,
    );
    expect(total).toBe(1701000 + 1644300 + 1583400 + 1596000 + 957600 + 1580250 + 1171800 + 3099600 + 672000 + 793800 + 907200);
  });
});

describe("campos de la carga de compras", () => {
  it("reconoce encabezados habituales de una hoja de compras", () => {
    const mapping = suggestMapping(
      ["Fecha de compra", "Fruta", "Proveedor", "Kg", "Valor"],
      compras.fields,
    );
    expect(Object.keys(mapping).sort()).toEqual(["baseCost", "date", "fruit", "kg", "supplier"]);
  });
});
