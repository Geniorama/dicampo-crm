import {
  cleanText,
  matchEnum,
  normalizeKey,
  parseBoolean,
  parseDateValue,
  parseDecimal,
} from "@/lib/import/values";
import { ValidationError } from "../errors";

/**
 * Lectura de celdas para los importadores.
 *
 * Cada función devuelve `undefined` cuando la celda viene vacía y lanza un
 * `ValidationError` con un mensaje concreto cuando viene escrita pero no se
 * entiende. Esa distinción es la que hace útil el informe: "Cupo de crédito:
 * no se entiende «mil quinientos»" se corrige solo; "datos inválidos" no.
 */

export type RowRecord = Record<string, string>;

export function text(record: RowRecord, key: string): string | undefined {
  const value = cleanText(record[key]);
  return value === "" ? undefined : value;
}

/** Campo obligatorio: si falta, la fila no se puede procesar. */
export function requiredText(
  record: RowRecord,
  key: string,
  label: string,
): string {
  const value = text(record, key);
  if (!value) {
    throw new ValidationError(`${label}: es obligatorio y la celda viene vacía.`);
  }
  return value;
}

/**
 * Quita las claves sin valor. Hace falta al actualizar: los esquemas
 * parciales exigen al menos un campo, y una clave presente con `undefined`
 * cuenta como campo enviado aunque no traiga nada.
 */
export function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

export function decimal(
  record: RowRecord,
  key: string,
  label: string,
): number | undefined {
  const raw = text(record, key);
  if (raw === undefined) return undefined;

  const value = parseDecimal(raw);
  if (value === null) {
    throw new ValidationError(`${label}: no se entiende el número «${raw}».`);
  }

  return value;
}

export function dateValue(
  record: RowRecord,
  key: string,
  label: string,
): Date | undefined {
  const raw = text(record, key);
  if (raw === undefined) return undefined;

  const value = parseDateValue(raw);
  if (value === null) {
    throw new ValidationError(
      `${label}: no se entiende la fecha «${raw}». Usa 05/09/2026 o 2026-09-05.`,
    );
  }

  return value;
}

export function boolean(
  record: RowRecord,
  key: string,
  label: string,
): boolean | undefined {
  const raw = text(record, key);
  if (raw === undefined) return undefined;

  const value = parseBoolean(raw);
  if (value === null) {
    throw new ValidationError(
      `${label}: no se entiende «${raw}». Escribe Sí o No.`,
    );
  }

  return value;
}

/**
 * Valor de un enum escrito como sea. Al fallar, el mensaje enumera lo que sí
 * se admite: quien corrige la hoja no tiene por qué adivinarlo.
 */
export function enumValue<T extends string>(
  record: RowRecord,
  key: string,
  labels: Record<T, string>,
  label: string,
): T | undefined {
  const raw = text(record, key);
  if (raw === undefined) return undefined;

  const value = matchEnum(raw, labels);
  if (value === null) {
    const allowed = Object.values<string>(labels).join(", ");
    throw new ValidationError(
      `${label}: «${raw}» no corresponde a ningún valor. Opciones: ${allowed}.`,
    );
  }

  return value;
}

/** Clave de comparación laxa, para cotejar nombres contra la base. */
export function comparisonKey(value: string | null | undefined): string {
  return normalizeKey(cleanText(value));
}

/** Quita todo lo que no sea dígito: el NIT viaja con puntos y guiones. */
export function digits(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const only = value.replace(/\D/g, "");
  return only === "" ? undefined : only;
}
