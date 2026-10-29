import { ZodError } from "zod";
import { readMappedRow } from "@/lib/import/mapping";
import type { ImportField } from "@/lib/import/entities";
import type {
  ColumnMapping,
  ImportMode,
  ImportReport,
  RowAction,
  RowOutcome,
} from "@/lib/import/types";
import { groupKeyOf } from "@/lib/import/batches";
import { AppError } from "../errors";
import type { SessionUser } from "../guards";
import type { RowRecord } from "./helpers";

/**
 * Motor de la carga masiva.
 *
 * Dos decisiones sostienen el módulo:
 *
 * 1. **La simulación y la ejecución real recorren el mismo código.** Cambia
 *    solo `dryRun`. Una vista previa calculada aparte acabaría prometiendo
 *    algo distinto de lo que después ocurre, que es justo lo que uno no
 *    quiere de una herramienta que escribe miles de registros.
 *
 * 2. **Una fila mala no tumba el archivo.** Cada fila se procesa y se reporta
 *    por separado; un error se anota y se sigue. Envolver todo en una
 *    transacción obligaría a corregir el archivo entero por una celda con una
 *    fecha rara.
 */

export type ProcessOptions = {
  user: SessionUser;
  mode: ImportMode;
  /** En simulación no se escribe nada en la base. */
  dryRun: boolean;
};

export type RowResult = {
  action: Exclude<RowAction, "error">;
  /** Con qué se reconoce la fila en el informe. */
  label: string;
  /** Detalle de lo hecho, o motivo de la omisión. */
  message?: string;
};

export type Importer<Ctx> = {
  /** Consultas de apoyo en bloque, una sola vez por archivo. */
  load(records: RowRecord[], options: ProcessOptions): Promise<Ctx>;
  process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult>;
};

/** Una fila del archivo con su número, para las cargas agrupadas. */
export type NumberedRecord = { line: number; record: RowRecord };

/**
 * Importador por unidades: varias filas con la misma llave (los renglones de
 * un pedido) dan un solo resultado. Una fila mala tumba su unidad, no el
 * archivo: un pedido a medias sería peor que ninguno.
 */
export type GroupImporter<Ctx> = {
  /** Campo que agrupa las filas. */
  groupBy: string;
  /** Cómo se llama cada unidad en el informe. */
  unit: { one: string; many: string };
  load(records: RowRecord[], options: ProcessOptions): Promise<Ctx>;
  processGroup(
    rows: NumberedRecord[],
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult>;
};

/**
 * Traduce cualquier excepción al mensaje que verá quien importa.
 *
 * Los errores de dominio ya vienen redactados para una persona; los de Zod se
 * reescriben con la etiqueta del campo (no con el nombre interno), y lo
 * inesperado se registra en el servidor y sale como un aviso genérico, para
 * no filtrar detalles de la base en la pantalla.
 */
export function describeError(
  error: unknown,
  labels: Record<string, string>,
): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        const label = labels[path] ?? path;
        return label ? `${label}: ${issue.message}` : issue.message;
      })
      .join(" · ");
  }

  if (error instanceof AppError) return error.message;

  console.error("[importar] fila con error no controlado:", error);
  return "Error inesperado al procesar la fila.";
}

/** Diccionario campo → etiqueta, para los mensajes de error. */
function labelsOf(fields: readonly ImportField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.label]));
}

/** `true` si la fila no aporta ni un dato tras cotejar las columnas. */
function isEmptyRecord(record: RowRecord): boolean {
  return Object.values(record).every((value) => value === "");
}

export async function runImport<Ctx>(
  importer: Importer<Ctx>,
  params: {
    entity: string;
    fields: readonly ImportField[];
    rows: readonly (readonly string[])[];
    lines?: readonly number[];
    mapping: ColumnMapping;
    options: ProcessOptions;
  },
): Promise<ImportReport> {
  const { entity, fields, rows, lines, mapping, options } = params;
  const labels = labelsOf(fields);

  const records = rows.map((row) => readMappedRow(row, mapping));
  const ctx = await importer.load(records, options);

  const outcomes: RowOutcome[] = [];
  const counts: Record<RowAction, number> = {
    crear: 0,
    actualizar: 0,
    omitir: 0,
    error: 0,
  };

  for (const [index, record] of records.entries()) {
    // La primera fila bajo el encabezado es la 1.
    const line = lines?.[index] ?? index + 1;

    if (isEmptyRecord(record)) {
      counts.omitir += 1;
      outcomes.push({
        line,
        action: "omitir",
        label: "—",
        message: "Fila sin datos en las columnas cotejadas.",
      });
      continue;
    }

    try {
      const result = await importer.process(record, ctx, options);
      counts[result.action] += 1;
      outcomes.push({ line, ...result });
    } catch (error) {
      counts.error += 1;
      outcomes.push({
        line,
        action: "error",
        label: firstFilled(record),
        message: describeError(error, labels),
      });
    }
  }

  return {
    entity,
    dryRun: options.dryRun,
    mode: options.mode,
    total: records.length,
    counts,
    rows: outcomes,
  };
}

/** Algo con qué nombrar una fila que falló antes de poder identificarse. */
function firstFilled(record: RowRecord): string {
  return Object.values(record).find((value) => value !== "") ?? "—";
}

/**
 * Igual que `runImport`, pero por unidades. El informe trae una línea por
 * unidad, señalada con su primera fila del archivo.
 */
export async function runGroupedImport<Ctx>(
  importer: GroupImporter<Ctx>,
  params: {
    entity: string;
    fields: readonly ImportField[];
    rows: readonly (readonly string[])[];
    lines?: readonly number[];
    mapping: ColumnMapping;
    options: ProcessOptions;
  },
): Promise<ImportReport> {
  const { entity, fields, rows, lines, mapping, options } = params;
  const labels = labelsOf(fields);

  const records = rows.map((row) => readMappedRow(row, mapping));
  const ctx = await importer.load(records, options);

  const counts: Record<RowAction, number> = { crear: 0, actualizar: 0, omitir: 0, error: 0 };
  const outcomes: RowOutcome[] = [];

  // Unidades en el orden de su primera fila; sin llave, cada fila va sola.
  const groups = new Map<string, NumberedRecord[]>();
  for (const [index, record] of records.entries()) {
    const line = lines?.[index] ?? index + 1;

    if (isEmptyRecord(record)) {
      counts.omitir += 1;
      outcomes.push({ line, action: "omitir", label: "—", message: "Fila sin datos en las columnas cotejadas." });
      continue;
    }

    const key = groupKeyOf(record[importer.groupBy]) || `#${line}`;
    const members = groups.get(key);
    if (members) members.push({ line, record });
    else groups.set(key, [{ line, record }]);
  }

  for (const members of groups.values()) {
    const line = members[0].line;
    try {
      const result = await importer.processGroup(members, ctx, options);
      counts[result.action] += 1;
      outcomes.push({ line, ...result });
    } catch (error) {
      counts.error += 1;
      outcomes.push({
        line,
        action: "error",
        label: firstFilled(members[0].record),
        message: describeError(error, labels),
      });
    }
  }

  outcomes.sort((a, b) => a.line - b.line);

  return {
    entity,
    dryRun: options.dryRun,
    mode: options.mode,
    total: groups.size,
    unit: importer.unit,
    counts,
    rows: outcomes,
  };
}
