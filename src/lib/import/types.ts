/**
 * Tipos compartidos por la carga masiva.
 *
 * Viven en `lib` porque los usan las dos orillas: la pantalla de cotejo en el
 * navegador y el motor que ejecuta la importación en el servidor.
 */

/** Qué hacer con una fila que ya existe en la base. */
export type ImportMode = "crear" | "actualizar" | "mezclar";

export const IMPORT_MODE_LABEL: Record<ImportMode, string> = {
  crear: "Solo crear registros nuevos",
  actualizar: "Solo actualizar los que ya existen",
  mezclar: "Crear los nuevos y actualizar los existentes",
};

/** Resultado de una fila del archivo. */
export type RowAction = "crear" | "actualizar" | "omitir" | "error";

export const ROW_ACTION_LABEL: Record<RowAction, string> = {
  crear: "Se crea",
  actualizar: "Se actualiza",
  omitir: "Se omite",
  error: "Error",
};

export type RowOutcome = {
  /** Número de la fila **en el archivo**, contando el encabezado. */
  line: number;
  action: RowAction;
  /** Con qué se reconoce la fila en el informe: "Panadería El Trigo". */
  label: string;
  /** Motivo de la omisión o texto del error. */
  message?: string;
};

export type ImportReport = {
  entity: string;
  /** `true` si fue una simulación: no se escribió nada. */
  dryRun: boolean;
  mode: ImportMode;
  total: number;
  counts: Record<RowAction, number>;
  rows: RowOutcome[];
};

/** Tabla cruda leída del archivo, antes de cotejar las columnas. */
export type ParsedTable = {
  /** Encabezados tal como vienen en el archivo. */
  headers: string[];
  rows: string[][];
  /** Hoja leída y las demás disponibles (solo Excel). */
  sheetName?: string;
  sheets?: string[];
  /** Separador detectado, para poder mostrarlo (solo CSV). */
  delimiter?: string;
  /** Filas descartadas por superar el límite del archivo. */
  truncated: number;
};

/** Lo que devuelve el análisis del archivo: la tabla y el cotejo propuesto. */
export type ImportAnalysis = ParsedTable & {
  suggestion: ColumnMapping;
  /** Campos obligatorios que la propuesta no logró cubrir. */
  missing: string[];
};

/**
 * Cotejo de columnas: por cada campo del destino, de dónde sale el valor.
 *
 * - `""`          el campo se deja vacío
 * - `col:<n>`     se toma de la columna n del archivo (base 0)
 * - `const:<v>`   se aplica el mismo valor a todas las filas
 *
 * El valor fijo existe porque media carga masiva se resuelve así: la hoja no
 * trae la columna "Estado", pero quien importa sabe que todos entran como
 * prospectos.
 */
export type ColumnMapping = Record<string, string>;

export const COLUMN_PREFIX = "col:";
export const CONSTANT_PREFIX = "const:";
