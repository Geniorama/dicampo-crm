import { readMappedRow } from "./mapping";
import { normalizeKey } from "./values";
import type { ColumnMapping, ImportReport } from "./types";

/**
 * Reparto de una carga en lotes.
 *
 * Algunas cargas hacen muchas consultas por fila (un pedido valida cliente,
 * vendedor, productos y precios, y escribe en una transacción). Mandar dos
 * mil filas en una sola petición rebasaría el tiempo de una función de
 * Netlify, así que el navegador las envía por lotes, uno tras otro.
 *
 * Las filas que forman una misma unidad —los renglones de un pedido— viajan
 * **siempre en el mismo lote**, aunque en el archivo no estén seguidas: el
 * servidor las agrupa por esa llave y un pedido partido en dos lotes se
 * crearía a medias.
 */

export type ImportBatchConfig = {
  /** Campo que agrupa filas en una unidad (el número del pedido). */
  groupBy: string;
  /** Unidades por lote. */
  maxGroups: number;
  /** Tope de filas por lote; una unidad sola nunca se parte. */
  maxRows: number;
};

export type ImportBatch = {
  rows: string[][];
  /** Número de cada fila en el archivo (la primera bajo el encabezado es la 1). */
  lines: number[];
  groups: number;
};

/** Llave de agrupación tolerante a mayúsculas, tildes y espacios. */
export function groupKeyOf(value: string | undefined): string {
  return normalizeKey(value ?? "");
}

export function planBatches(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  config: ImportBatchConfig,
): ImportBatch[] {
  // Unidades en el orden en que aparecen por primera vez. Una fila sin llave
  // es su propia unidad: el servidor la rechazará con su motivo.
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = groupKeyOf(readMappedRow(row, mapping)[config.groupBy]) || `#${index}`;
    const members = groups.get(key);
    if (members) members.push(index);
    else groups.set(key, [index]);
  });

  const batches: ImportBatch[] = [];
  let current: ImportBatch = { rows: [], lines: [], groups: 0 };

  for (const members of groups.values()) {
    const full =
      current.groups >= config.maxGroups ||
      (current.groups > 0 && current.rows.length + members.length > config.maxRows);
    if (full) {
      batches.push(current);
      current = { rows: [], lines: [], groups: 0 };
    }

    for (const index of members) {
      current.rows.push([...rows[index]]);
      current.lines.push(index + 1);
    }
    current.groups += 1;
  }

  if (current.groups > 0) batches.push(current);
  return batches;
}

/** Junta los informes de los lotes en uno solo, ordenado por fila. */
export function mergeReports(reports: readonly ImportReport[]): ImportReport | null {
  if (reports.length === 0) return null;

  const [first] = reports;
  const counts: ImportReport["counts"] = { crear: 0, actualizar: 0, omitir: 0, error: 0 };
  for (const report of reports) {
    for (const action of Object.keys(counts) as (keyof typeof counts)[]) {
      counts[action] += report.counts[action];
    }
  }

  return {
    ...first,
    total: reports.reduce((sum, report) => sum + report.total, 0),
    counts,
    rows: reports.flatMap((report) => report.rows).sort((a, b) => a.line - b.line),
  };
}
