/**
 * Conversión de texto libre a los tipos del dominio.
 *
 * Una carga masiva recibe lo que cada quien tenga en su hoja de cálculo: el
 * cupo escrito como "1.500.000", la fecha como "05/09/2026" y el tipo de
 * cliente como "Panadería". Estas funciones son puras a propósito — se
 * prueban sin base de datos y las comparten todos los importadores.
 */

/** Quita acentos, signos y espacios: "Razón Social " → "razonsocial". */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    // Rango de marcas diacríticas: separa la tilde de la letra y la borra.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Palabras normalizadas del encabezado, para cotejar por término suelto. */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Número escrito a la colombiana: "$ 1.500.000,50" → 1500000.5.
 *
 * El caso ambiguo es "1.234": puede ser mil doscientos treinta y cuatro o un
 * decimal. Se resuelve por la forma — un punto seguido de exactamente tres
 * dígitos es separador de miles, que es lo que significa en una lista de
 * precios; cualquier otro punto es decimal. Una coma sola siempre es decimal,
 * porque así exporta Excel en español.
 */
export function parseDecimal(raw: string): number | null {
  const text = cleanText(raw)
    .replace(/\s/g, "")
    .replace(/[$€]/g, "")
    .replace(/cop/gi, "");
  if (!text) return null;

  // Contabilidad escribe los negativos entre paréntesis.
  const negative = text.startsWith("-") || /^\(.+\)$/.test(text);
  const body = text.replace(/^[-+(]/, "").replace(/\)$/, "");
  if (!/^[\d.,]+$/.test(body) || !/\d/.test(body)) return null;

  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;

  let normalized = body;
  if (dots > 0 && commas > 0) {
    // Con ambos separadores, el último que aparece es el decimal.
    const decimal = body.lastIndexOf(",") > body.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = body.split(thousands).join("").replace(decimal, ".");
  } else if (commas > 1) {
    normalized = body.split(",").join("");
  } else if (commas === 1) {
    normalized = body.replace(",", ".");
  } else if (dots > 1) {
    normalized = body.split(".").join("");
  } else if (dots === 1) {
    // "1.500" son mil quinientos, pero "0.190" es un decimal: nadie escribe
    // un separador de miles detrás de un cero.
    const [whole, fraction] = body.split(".");
    const isThousands = fraction.length === 3 && whole !== "" && whole !== "0";
    normalized = isThousands ? whole + fraction : body;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return negative ? -value : value;
}

const TRUE_WORDS = new Set([
  "si",
  "s",
  "x",
  "1",
  "true",
  "verdadero",
  "v",
  "yes",
  "y",
  "activo",
  "principal",
]);

const FALSE_WORDS = new Set([
  "no",
  "n",
  "0",
  "false",
  "falso",
  "f",
  "inactivo",
  "secundaria",
]);

/** "Sí", "X", "1", "VERDADERO" → true. Devuelve null si no reconoce el valor. */
export function parseBoolean(raw: string): boolean | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  if (TRUE_WORDS.has(key)) return true;
  if (FALSE_WORDS.has(key)) return false;
  return null;
}

/** Día 0 de Excel: los seriales cuentan desde el 30/12/1899. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;

/**
 * Fecha de una celda, en hora **local**.
 *
 * Igual que en los filtros de reportes, no se usa `new Date("2026-09-01")`:
 * esa cadena se interpreta como medianoche UTC y al leerla en Bogotá (UTC−5)
 * retrocede un día — un lote quedaría venciendo una jornada antes de tiempo.
 */
export function parseDateValue(raw: string): Date | null {
  const text = cleanText(raw);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (iso) return localDate(+iso[1], +iso[2], +iso[3]);

  // Día primero, que es como se escribe la fecha en Colombia.
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) return localDate(expandYear(+dmy[3]), +dmy[2], +dmy[1]);

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return localDate(+compact[1], +compact[2], +compact[3]);

  // Serial de Excel. Se acota a un rango plausible (1954–2064) para no
  // confundir con una fecha cualquier número que caiga en la columna.
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 60000) {
      const utc = new Date(EXCEL_EPOCH + serial * DAY_MS);
      return localDate(
        utc.getUTCFullYear(),
        utc.getUTCMonth() + 1,
        utc.getUTCDate(),
      );
    }
  }

  return null;
}

function localDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Rebota los días que no existen: "31/02/2026" se iría a marzo.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Año de dos cifras: 26 → 2026, 98 → 1998. */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

/**
 * Reconoce un valor de enum escrito como lo diría una persona: acepta tanto
 * la clave ("PANADERIA") como la etiqueta de la interfaz ("Panadería").
 */
export function matchEnum<T extends string>(
  raw: string,
  labels: Record<T, string>,
): T | null {
  const key = normalizeKey(raw);
  if (!key) return null;

  const entries = Object.entries(labels) as [T, string][];

  for (const [value, label] of entries) {
    if (normalizeKey(value) === key || normalizeKey(label) === key) return value;
  }

  // Segunda pasada tolerante: "credito 30" contra "CREDITO_30".
  for (const [value, label] of entries) {
    const candidates = [normalizeKey(value), normalizeKey(label)];
    if (candidates.some((c) => c.startsWith(key) || key.startsWith(c))) {
      return value;
    }
  }

  return null;
}
