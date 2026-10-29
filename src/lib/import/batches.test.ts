import { describe, expect, it } from "vitest";
import { mergeReports, planBatches } from "./batches";

const mapping = { externalRef: "col:0", sku: "col:1" };
const config = { groupBy: "externalRef", maxGroups: 2, maxRows: 100 };

describe("planBatches", () => {
  it("mantiene juntos los renglones de un pedido aunque no estén seguidos", () => {
    const rows = [
      ["P-1", "MAN-K"],
      ["P-2", "FRE-K"],
      ["P-1", "LUL-K"],
    ];

    const [batch] = planBatches(rows, mapping, config);
    expect(batch.lines).toEqual([1, 3, 2]);
    expect(batch.rows.map((row) => row[0])).toEqual(["P-1", "P-1", "P-2"]);
    expect(batch.groups).toBe(2);
  });

  it("parte por número de pedidos", () => {
    const rows = [["A", "x"], ["B", "x"], ["C", "x"], ["D", "x"], ["E", "x"]];
    const batches = planBatches(rows, mapping, config);
    expect(batches.map((batch) => batch.groups)).toEqual([2, 2, 1]);
    expect(batches.flatMap((batch) => batch.lines)).toEqual([1, 2, 3, 4, 5]);
  });

  it("parte por filas sin dividir un pedido, aunque solo él ya pase del tope", () => {
    const rows = [
      ["A", "1"], ["A", "2"], ["A", "3"],
      ["B", "1"],
    ];
    const batches = planBatches(rows, mapping, { ...config, maxRows: 2 });
    expect(batches.map((batch) => batch.lines)).toEqual([[1, 2, 3], [4]]);
  });

  it("agrupa sin importar mayúsculas ni espacios", () => {
    const rows = [["ped-01", "x"], [" PED-01 ", "y"]];
    expect(planBatches(rows, mapping, config)[0].groups).toBe(1);
  });

  it("una fila sin número es su propia unidad", () => {
    const rows = [["", "x"], ["", "y"]];
    expect(planBatches(rows, mapping, config)[0].groups).toBe(2);
  });
});

describe("mergeReports", () => {
  it("suma los conteos y ordena las filas", () => {
    const base = { entity: "pedidos", dryRun: true, mode: "crear" as const };
    const merged = mergeReports([
      { ...base, total: 1, counts: { crear: 1, actualizar: 0, omitir: 0, error: 0 }, rows: [{ line: 5, action: "crear", label: "B" }] },
      { ...base, total: 2, counts: { crear: 0, actualizar: 0, omitir: 1, error: 1 }, rows: [{ line: 1, action: "error", label: "A" }, { line: 9, action: "omitir", label: "C" }] },
    ]);
    expect(merged?.total).toBe(3);
    expect(merged?.counts).toEqual({ crear: 1, actualizar: 0, omitir: 1, error: 1 });
    expect(merged?.rows.map((row) => row.line)).toEqual([1, 5, 9]);
  });

  it("sin informes no hay nada que juntar", () => {
    expect(mergeReports([])).toBeNull();
  });
});
