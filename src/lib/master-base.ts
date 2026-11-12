import type { ClientRelationStatus } from "@/generated/prisma/enums";
import { onlyDigits } from "./nit";

/**
 * Reglas puras para leer el "Libro maestro" de la base final de Dicampo
 * (`scripts/importar-base-maestra.ts`). Van aparte del script para poder
 * probarlas sin Excel ni base de datos.
 */

const strip = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "901799112-4" → "901799112"; vacío o fuera de 5–15 dígitos → null. */
export function parseMasterNit(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const withDv = /^([\d.\s]+?)\s*-\s*\d$/.exec(text);
  const digits = onlyDigits(withDv ? withDv[1] : text);
  return digits.length >= 5 && digits.length <= 15 ? digits : null;
}

const RELATION: Record<string, ClientRelationStatus> = {
  "cliente activo": "ACTIVO",
  "por recuperar": "POR_RECUPERAR",
  "en alerta": "EN_ALERTA",
};

export function parseRelationStatus(raw: string | null | undefined): ClientRelationStatus | null {
  return RELATION[strip(raw ?? "")] ?? null;
}

/**
 * La hoja saca "Día de entrega" y "Día de contacto" con una fórmula sobre
 * la zona; si el libro llega sin el resultado calculado, se reconstruye de
 * esta tabla (número de zona → entrega, contacto).
 */
const ZONE_DAYS: Record<number, { delivery: string; order: string }> = {
  1: { delivery: "Viernes", order: "Jueves" },
  2: { delivery: "Martes", order: "Lunes" },
  3: { delivery: "Jueves", order: "Miércoles" },
  4: { delivery: "Lunes", order: "Viernes" },
  5: { delivery: "Miércoles", order: "Martes" },
};

export function daysForZone(zoneName: string | null | undefined) {
  const match = /zona\s*(\d)/i.exec(zoneName ?? "");
  return match ? (ZONE_DAYS[Number(match[1])] ?? null) : null;
}

/** Un valor de día legible: descarta fórmulas sin resultado y vacíos. */
export function cleanDay(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || text.startsWith("{") || text === "null") return null;
  return text;
}

/** Primer nombre sin tildes ni mayúsculas, para cruzar "Fabian" con "Fabián Rojas". */
export function firstNameKey(name: string): string {
  return strip(name).split(/\s+/)[0] ?? "";
}

/** Correo de una cuenta nueva de asesor: nombre@dicampo.co. */
export function advisorEmail(name: string, domain = "dicampo.co"): string {
  return `${firstNameKey(name).replace(/[^a-z0-9]/g, "")}@${domain}`;
}

/** "Sin asignar" y vacíos no son un asesor. */
export function isUnassigned(raw: string | null | undefined): boolean {
  const key = strip(raw ?? "");
  return key === "" || key === "sin asignar" || key === "null";
}

/** La fecha del libro es de calendario (medianoche UTC): se guarda al mediodía de Bogotá. */
export function calendarToNoonBogota(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 17, 0, 0));
}
