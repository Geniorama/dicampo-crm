import { COLUMN_PREFIX, CONSTANT_PREFIX, type ColumnMapping } from "./types";
import { cleanText, normalizeKey, tokenize } from "./values";

/**
 * Cotejo de columnas: qué columna del archivo alimenta cada campo del CRM.
 *
 * Es lo que evita depender de una plantilla. La sugerencia automática acierta
 * la mayoría de encabezados normales ("Razón social", "NIT", "Celular") y lo
 * que falle se corrige a mano en la pantalla; nada se importa sin que alguien
 * haya visto el cotejo.
 */

/** Lo mínimo que necesita un campo para poder cotejarse. */
export type MatchableField = {
  key: string;
  label: string;
  required?: boolean;
  /** Encabezados equivalentes que se ven en las hojas reales. */
  aliases?: string[];
};

/**
 * Parecido entre un encabezado del archivo y un candidato del campo, de 0
 * (nada que ver) a 100 (idénticos una vez normalizados).
 *
 * Las coincidencias por contenido exigen al menos cuatro caracteres: sin ese
 * piso, "nit" casaría con "unitario" y el cotejo automático haría más daño
 * que bien.
 */
export function scoreMatch(header: string, candidate: string): number {
  const h = normalizeKey(header);
  const c = normalizeKey(candidate);
  if (!h || !c) return 0;

  if (h === c) return 100;

  const headerTokens = tokenize(header);
  const candidateTokens = tokenize(candidate);

  /*
   * Coincidencia por palabras, ponderada por cuánto del encabezado explica el
   * candidato. Es lo que distingue "Teléfono del contacto" —donde encajan las
   * dos palabras de `contactPhone`— de la lectura ingenua, que vería la
   * palabra "teléfono" y lo daría por el teléfono del cliente.
   */
  if (
    headerTokens.length > 0 &&
    candidateTokens.length > 0 &&
    candidateTokens.every((token) => headerTokens.includes(token))
  ) {
    const coverage = Math.min(1, candidateTokens.length / headerTokens.length);
    return 50 + Math.round(30 * coverage);
  }

  if (h.startsWith(c) || c.startsWith(h)) return 60;
  if (c.length >= 4 && h.includes(c)) return 40;
  if (h.length >= 4 && c.includes(h)) return 30;

  return 0;
}

const MIN_SCORE = 30;

/**
 * Propone un cotejo completo.
 *
 * Se resuelve por mejor puntaje global, no campo por campo: si "Teléfono"
 * puntúa alto para `phone` y para `contactPhone`, se lo queda el que mejor
 * encaje y el otro busca otra columna, en vez de que gane el primero de la
 * lista. Cada columna alimenta un solo campo.
 */
export function suggestMapping(
  headers: readonly string[],
  fields: readonly MatchableField[],
): ColumnMapping {
  type Pair = { fieldKey: string; column: number; score: number };
  const pairs: Pair[] = [];

  fields.forEach((field) => {
    const candidates = [field.label, field.key, ...(field.aliases ?? [])];

    headers.forEach((header, column) => {
      const score = Math.max(
        ...candidates.map((candidate) => scoreMatch(header, candidate)),
      );
      if (score >= MIN_SCORE) pairs.push({ fieldKey: field.key, column, score });
    });
  });

  pairs.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();

  for (const pair of pairs) {
    if (mapping[pair.fieldKey] || usedColumns.has(pair.column)) continue;
    mapping[pair.fieldKey] = `${COLUMN_PREFIX}${pair.column}`;
    usedColumns.add(pair.column);
  }

  return mapping;
}

/** Columnas del archivo que no alimentan ningún campo. */
export function unmappedColumns(
  headers: readonly string[],
  mapping: ColumnMapping,
): string[] {
  const used = new Set(
    Object.values(mapping)
      .filter((source) => source.startsWith(COLUMN_PREFIX))
      .map((source) => Number(source.slice(COLUMN_PREFIX.length))),
  );

  return headers.filter((_, index) => !used.has(index));
}

/** Campos obligatorios que quedaron sin origen. */
export function missingRequired(
  mapping: ColumnMapping,
  fields: readonly MatchableField[],
): MatchableField[] {
  return fields.filter((field) => field.required && !mapping[field.key]);
}

/**
 * Aplica el cotejo a una fila: devuelve el registro `campo → texto` que
 * recibirá el importador. Todo llega como cadena; convertir a número, fecha
 * o enum es tarea de cada importador, que sabe qué espera.
 */
export function readMappedRow(
  row: readonly string[],
  mapping: ColumnMapping,
): Record<string, string> {
  const record: Record<string, string> = {};

  for (const [fieldKey, source] of Object.entries(mapping)) {
    if (!source) continue;

    if (source.startsWith(CONSTANT_PREFIX)) {
      record[fieldKey] = cleanText(source.slice(CONSTANT_PREFIX.length));
      continue;
    }

    if (source.startsWith(COLUMN_PREFIX)) {
      const column = Number(source.slice(COLUMN_PREFIX.length));
      if (Number.isInteger(column)) record[fieldKey] = cleanText(row[column]);
    }
  }

  return record;
}
