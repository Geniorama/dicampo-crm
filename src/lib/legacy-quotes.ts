import { onlyDigits } from "./nit";

/**
 * Lectura del histórico de cotizaciones del Excel comercial
 * (hoja "Histórico": una fila por línea de producto cotizado).
 *
 * Es lógica pura —sin base de datos ni archivos— para poder probarla con las
 * filas reales del Excel. La escritura la hace `scripts/importar-cotizaciones.ts`.
 */

/** Una fila de la hoja, ya con las celdas como vienen (texto o número). */
export type LegacyRow = Record<string, unknown>;

export type LegacyQuoteLine = {
  /** Sabor tal como está escrito en el Excel. */
  flavor: string;
  kilos: number;
  unitPrice: number;
  subtotal: number;
};

export type LegacyQuote = {
  code: string;
  date: Date;
  client: string;
  /** Tipo de cliente del Excel: es la lista de precios (Distribuidor, Mayorista…). */
  priceTier: string;
  contact: string;
  phoneDigits: string;
  email: string;
  address: string;
  advisor: string;
  nitDigits: string;
  billing: "FACTURA" | "REMISION";
  discountLabel: string;
  discountPercent: number;
  /** Total que mostraba el Excel, con descuento. */
  total: number;
  lines: LegacyQuoteLine[];
};

/** "$20.350" → 20350 · 20350 → 20350 · "1.234,5" → 1234.5 */
export function parseMoney(value: unknown): number {
  if (typeof value === "number") return value;
  const text = String(value ?? "").replace(/[^\d,.-]/g, "");
  if (!text) return 0;
  // En el Excel en español el punto separa miles y la coma los decimales.
  return Number(text.replace(/\./g, "").replace(",", "."));
}

/** Cantidades con coma decimal: "2,5" → 2.5 */
export function parseQuantity(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(String(value ?? "").trim().replace(",", ".")) || 0;
}

/** "13/05/2026" o Date → mediodía UTC de ese día (evita saltos de día por zona). */
export function parseLegacyDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 12));
  }
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
}

/** "Promo 15% primer pedido" → 15 · "Sin descuento" → 0 */
export function parseDiscountPercent(label: string): number {
  const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(label);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

/** "NIT  79992751 - 6" → "79992751" (sin dígito de verificación) */
export function parseLegacyNit(value: unknown): string {
  const text = String(value ?? "").replace(/^NIT/i, "").trim();
  if (!text) return "";
  // "79992751 - 6": el DV viene separado por guion.
  const withDv = /^([\d.\s]+?)\s*-\s*\d$/.exec(text);
  return onlyDigits(withDv ? withDv[1] : text);
}

const text = (value: unknown) => String(value ?? "").trim();

/**
 * Agrupa las filas por N° de cotización. Las filas sin código, sin fecha o
 * sin sabor (encabezados, notas, filas en blanco) se descartan y se cuentan.
 */
export function groupLegacyQuotes(rows: readonly LegacyRow[]): {
  quotes: LegacyQuote[];
  skippedRows: number;
} {
  const byCode = new Map<string, LegacyQuote>();
  let skippedRows = 0;

  for (const row of rows) {
    const code = text(row["N° Cotización"]);
    const date = parseLegacyDate(row["Fecha"]);
    const flavor = text(row["Sabor"]);

    if (!/^COT-/i.test(code) || !date || !flavor) {
      skippedRows += 1;
      continue;
    }

    let quote = byCode.get(code);
    if (!quote) {
      const discountLabel = text(row["Descuento"]);
      quote = {
        code,
        date,
        client: text(row["Cliente"]),
        priceTier: text(row["Tipo cliente"]),
        contact: text(row["Contacto"]),
        phoneDigits: onlyDigits(text(row["Teléfono"])),
        email: text(row["Email"]),
        address: text(row["Dirección"]),
        advisor: text(row["Asesor"]),
        nitDigits: parseLegacyNit(row["NIT"]),
        billing: /remisi/i.test(text(row["Forma facturación"])) ? "REMISION" : "FACTURA",
        discountLabel: /^sin descuento$/i.test(discountLabel) ? "" : discountLabel,
        discountPercent: parseDiscountPercent(discountLabel),
        total: parseMoney(row["Total cotización"]),
        lines: [],
      };
      byCode.set(code, quote);
    }

    quote.lines.push({
      flavor,
      kilos: parseQuantity(row["Kilos"]),
      unitPrice: parseMoney(row["Precio kilo"]),
      subtotal: parseMoney(row["Subtotal línea"]),
    });
  }

  return { quotes: [...byCode.values()], skippedRows };
}

/**
 * Nombre del sabor en el Excel → `Product.flavor` del catálogo del CRM.
 * Lo que no esté aquí se compara tal cual (Mango, Fresa, Lulo, Mora…).
 */
const FLAVOR_ALIASES: Record<string, string> = {
  "limonada natural": "Limonada",
  "limonada hierbabuena": "Limón Hierbabuena",
  "limonada cerezada": "Limón Cereza",
  "limonada mango biche": "Limón Mango Biche",
  "limonada de coco": "Limón Coco",
};

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/** Llave de comparación de sabores: sin tildes ni mayúsculas, con alias. */
export function flavorKey(legacyFlavor: string): string {
  const key = normalize(legacyFlavor);
  return normalize(FLAVOR_ALIASES[key] ?? key);
}

/** Presentación del catálogo a la que apunta una línea del Excel. */
export type LegacyPresentation = "KILO" | "LIBRA" | "MEDIO_LITRO" | "LITRO" | "TRES_LITROS";

const ZUMO_VOLUMES: [RegExp, LegacyPresentation][] = [
  [/(?:1\/2|medio)\s*litro|500\s*ml/, "MEDIO_LITRO"],
  [/3\s*litros?/, "TRES_LITROS"],
  [/1\s*litro/, "LITRO"],
];

/**
 * Producto del Excel → sabor y presentación del CRM. En el Excel los bloques
 * ("Bloque pulpa x 500g Mango") y los zumos ("Zumo Limon 1 litro") se cotizan
 * por unidad, y la columna "Kilos" trae unidades; el resto va por kilo.
 */
export function legacyProduct(legacyName: string): {
  flavorKey: string;
  presentation: LegacyPresentation;
} {
  const name = normalize(legacyName).replace(/\s+/g, " ");

  const block = /^bloque pulpa x 500\s*g\s+(.+)$/.exec(name);
  if (block) return { flavorKey: flavorKey(block[1]), presentation: "LIBRA" };

  const juice = /^zumo\s+(?:de\s+)?(.+?)\s+((?:1\/2|medio|3|1)\s*litros?.*|500\s*ml.*)$/.exec(name);
  if (juice) {
    const volume = ZUMO_VOLUMES.find(([pattern]) => pattern.test(juice[2]));
    if (volume) return { flavorKey: flavorKey(`zumo de ${juice[1]}`), presentation: volume[1] };
  }

  return { flavorKey: flavorKey(legacyName), presentation: "KILO" };
}

/** Llave para cruzar una línea del Excel con una variante del CRM. */
export const variantKey = (flavor: string, presentation: string) => `${flavor}|${presentation}`;

/**
 * Lo que diferencia el total del Excel del cálculo del CRM: pesos de
 * redondeo. Más que eso indica una cotización mal leída.
 */
export function totalsAgree(quote: LegacyQuote, tolerance = 5): boolean {
  const gross = quote.lines.reduce((sum, line) => sum + line.subtotal, 0);
  const expected = Math.round(gross * (1 - quote.discountPercent / 100));
  return Math.abs(expected - quote.total) <= tolerance;
}
