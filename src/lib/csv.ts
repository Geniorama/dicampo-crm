/**
 * Generación de CSV para las exportaciones de reportes.
 *
 * Pensado para abrirse en Excel en español: separador de punto y coma y BOM
 * al inicio. Sin el BOM, Excel en Windows interpreta el archivo como ANSI y
 * los acentos salen rotos ("Panadería" → "PanaderÃ­a").
 */

const SEPARATOR = ";";
const BOM = "﻿";

/**
 * Escapa un valor para CSV.
 *
 * Los números se emiten con coma decimal, que es lo que espera Excel en
 * configuración regional colombiana; si se emitieran con punto, los leería
 * como texto y no se podrían sumar.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
  }

  const text = String(value);

  // Una celda que empieza por =, +, - o @ puede ejecutarse como fórmula al
  // abrir el archivo. Se antepone un apóstrofe para neutralizarla.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;

  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(SEPARATOR),
    ...rows.map((row) =>
      columns.map((column) => escapeCell(column.value(row))).join(SEPARATOR),
    ),
  ];

  return BOM + lines.join("\r\n");
}

/** Nombre de archivo con la fecha, para no sobrescribir descargas previas. */
export function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
