import { UserRole } from "@/generated/prisma/enums";
import { toCsv, type CsvColumn } from "@/lib/csv";
import {
  IMPORT_ENTITIES,
  IMPORT_ENTITY_KEYS,
  type ImportEntity,
  type ImportEntityKey,
} from "@/lib/import/entities";
import { missingRequired, suggestMapping } from "@/lib/import/mapping";
import type { ImportAnalysis, ImportReport } from "@/lib/import/types";
import { ValidationError } from "../errors";
import type { SessionUser } from "../guards";
import { parseImportFile } from "../import/parse-file";
import {
  IMPORT_REGISTRY,
  importAccess,
  type ImportAccess,
} from "../import/registry";
import type { ImportRunInput } from "../validators/imports";
import { MAX_IMPORT_ROWS } from "../validators/imports";

/**
 * Carga masiva de información.
 *
 * El recorrido tiene tres pasos y los tres pasan por aquí:
 *
 * 1. **Analizar** el archivo — leerlo y proponer un cotejo de columnas.
 * 2. **Simular** — recorrer las filas sin escribir y devolver el informe.
 * 3. **Ejecutar** — el mismo recorrido, ahora escribiendo.
 *
 * Nada se guarda entre pasos: el archivo se convierte en filas y son esas
 * filas las que van y vienen. Evita tener que limpiar archivos a medio
 * importar y hace que la operación sea reintentable sin estado que estorbe.
 */

/** ¿Este rol puede ejecutar esta carga? Mismas reglas que `requireUser`. */
export function canImport(user: SessionUser, access: ImportAccess): boolean {
  if (user.role === UserRole.ADMIN) return true;
  if (access === "admin") return false;
  return access.includes(user.role);
}

/** Entidades que el usuario puede cargar, para el índice de la pantalla. */
export function listImportEntities(user: SessionUser): ImportEntity[] {
  return IMPORT_ENTITY_KEYS.filter((key) =>
    canImport(user, importAccess(key)),
  ).map((key) => IMPORT_ENTITIES[key]);
}

export function getImportEntity(key: ImportEntityKey): ImportEntity {
  return IMPORT_ENTITIES[key];
}

/** Lee el archivo y propone con qué columna se alimenta cada campo. */
export async function analyzeImport(
  key: ImportEntityKey,
  file: File,
  sheet?: string,
): Promise<ImportAnalysis> {
  const entity = IMPORT_ENTITIES[key];

  const table = await parseImportFile(file, {
    maxRows: MAX_IMPORT_ROWS,
    sheet,
  });

  if (table.rows.length === 0) {
    throw new ValidationError(
      "El archivo tiene encabezados pero ninguna fila de datos.",
    );
  }

  const suggestion = suggestMapping(table.headers, entity.fields);

  return {
    ...table,
    suggestion,
    missing: missingRequired(suggestion, entity.fields).map(
      (field) => field.label,
    ),
  };
}

/**
 * Ejecuta (o simula) la carga.
 *
 * Las comprobaciones previas son de la carga entera, no de una fila: un modo
 * que la entidad no admite o un campo obligatorio sin cotejar harían fallar
 * las dos mil filas por lo mismo, y eso se dice una vez y antes de empezar.
 */
export async function runImport(
  user: SessionUser,
  key: ImportEntityKey,
  input: ImportRunInput,
): Promise<ImportReport> {
  const { entity, run } = IMPORT_REGISTRY[key];

  if (!entity.modes.includes(input.mode)) {
    throw new ValidationError(
      `La carga de ${entity.label.toLowerCase()} no admite ese modo.`,
    );
  }

  const missing = missingRequired(input.mapping, entity.fields);
  if (missing.length > 0) {
    throw new ValidationError(
      `Faltan campos obligatorios por cotejar: ${missing
        .map((field) => field.label)
        .join(", ")}.`,
    );
  }

  return run({
    rows: input.rows,
    mapping: input.mapping,
    options: { user, mode: input.mode, dryRun: input.dryRun },
  });
}

/**
 * Plantilla de ejemplo.
 *
 * No hace falta para importar —de eso va el cotejo de columnas—, pero sirve
 * para empezar de cero y para ver de un vistazo qué acepta cada campo.
 */
export function buildImportTemplate(key: ImportEntityKey): string {
  const entity = IMPORT_ENTITIES[key];

  const example = Object.fromEntries(
    entity.fields.map((field) => [field.key, field.example ?? ""]),
  );

  const columns: CsvColumn<Record<string, string>>[] = entity.fields.map(
    (field) => ({
      header: field.label,
      value: (row) => row[field.key],
    }),
  );

  return toCsv([example], columns);
}
