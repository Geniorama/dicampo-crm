import type { ParsedTable } from "./types";
import { cleanText } from "./values";

/**
 * Lectura de archivos delimitados.
 *
 * El complemento de `src/lib/csv.ts`, que es el que escribe. Aquí se lee lo
 * que traiga la persona: Excel en español exporta con punto y coma, Google
 * Sheets y cualquier sistema en inglés con coma, y más de un ERP escupe
 * tabulaciones. Por eso el separador se detecta en vez de exigirse.
 */

const CANDIDATE_DELIMITERS = [";", ",", "\t", "|"] as const;

export const DELIMITER_LABEL: Record<string, string> = {
  ";": "punto y coma",
  ",": "coma",
  "\t": "tabulación",
  "|": "barra vertical",
};

/**
 * Elige el separador contando ocurrencias **fuera de comillas** en las
 * primeras líneas. Contar solo la primera no basta: una razón social con
 * coma dentro de comillas desempataría mal.
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20_000);
  let best = ";";
  let bestScore = 0;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    let count = 0;
    let quoted = false;

    for (let i = 0; i < sample.length; i += 1) {
      const char = sample[i];
      if (char === '"') {
        quoted = !quoted;
      } else if (!quoted && char === delimiter) {
        count += 1;
      }
    }

    if (count > bestScore) {
      best = delimiter;
      bestScore = count;
    }
  }

  return best;
}

/**
 * Divide el texto en filas y celdas respetando las comillas dobles, que
 * pueden contener el separador y hasta saltos de línea (una dirección
 * escrita en dos renglones es un clásico).
 */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        // Dos comillas seguidas dentro de un campo son una comilla literal.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\r") {
      i += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  row.push(field);
  rows.push(row);

  return rows;
}

/**
 * Deshace la neutralización de fórmulas que aplica nuestro propio exportador
 * (`src/lib/csv.ts` antepone un apóstrofe a lo que empiece por = + - @), para
 * que un archivo exportado del CRM vuelva a entrar tal cual.
 */
function cleanCell(value: string): string {
  const text = cleanText(value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

/** `true` si la fila no tiene ni una celda con contenido. */
function isBlank(row: readonly string[]): boolean {
  return row.every((cell) => cell === "");
}

/**
 * Convierte texto delimitado en una tabla con encabezados.
 *
 * `maxRows` acota lo que se carga en memoria y lo que viaja de vuelta al
 * navegador; el sobrante se informa en `truncated` en vez de fallar, para que
 * un archivo enorme no deje a la persona sin saber qué pasó.
 */
export function parseDelimited(
  input: string,
  options: { delimiter?: string; maxRows: number },
): ParsedTable {
  // El BOM que Excel espera al leer estorba al procesar: se descarta.
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = options.delimiter ?? detectDelimiter(text);

  const matrix = splitRows(text, delimiter).map((row) => row.map(cleanCell));

  return { ...buildTable(matrix, options.maxRows), delimiter };
}

/**
 * Convierte una matriz de celdas en tabla con encabezados. La comparten el
 * lector de CSV y el de Excel, para que los dos formatos se comporten igual.
 *
 * El encabezado es la primera fila con al menos dos celdas con contenido: las
 * hojas de verdad suelen empezar con un título suelto en A1 ("LISTADO DE
 * CLIENTES") que no es el encabezado de nada.
 */
export function buildTable(
  matrix: readonly (readonly string[])[],
  maxRows: number,
): Omit<ParsedTable, "delimiter"> {
  const meaningful = matrix.filter((row) => !isBlank(row));
  if (meaningful.length === 0) return { headers: [], rows: [], truncated: 0 };

  const headerIndex = Math.max(
    0,
    meaningful.findIndex((row) => row.filter(Boolean).length >= 2),
  );

  const headers = normalizeHeaders(meaningful[headerIndex]);
  const dataRows = meaningful.slice(headerIndex + 1);

  const rows = dataRows
    .slice(0, maxRows)
    // Iguala el ancho de todas las filas al del encabezado: una fila corta
    // (celdas finales vacías que el exportador omitió) no debe desalinear.
    .map((row) => headers.map((_, index) => row[index] ?? ""));

  return { headers, rows, truncated: Math.max(0, dataRows.length - rows.length) };
}

/**
 * Da nombre a las columnas sin encabezado y desambigua los repetidos, para
 * que la pantalla de cotejo pueda listarlos sin confundir dos "Teléfono".
 */
export function normalizeHeaders(row: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return row.map((raw, index) => {
    const base = cleanText(raw) || `Columna ${index + 1}`;
    const repeated = seen.get(base) ?? 0;
    seen.set(base, repeated + 1);

    return repeated === 0 ? base : `${base} (${repeated + 1})`;
  });
}
