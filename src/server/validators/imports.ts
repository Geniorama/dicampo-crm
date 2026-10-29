import { z } from "zod";
import { IMPORT_ENTITY_KEYS } from "@/lib/import/entities";

/** Validación de la carga masiva. */

/**
 * Tope de filas por archivo.
 *
 * El archivo se lee una vez, se devuelve al navegador para cotejar las
 * columnas y vuelve al servidor para ejecutarse. Eso acota cuánto puede
 * viajar: por encima de este tope conviene partir el archivo, que además hace
 * el informe legible. No es un límite del negocio, es de la conversación.
 */
export const MAX_IMPORT_ROWS = 2000;

/** Largo máximo de una celda; por encima seguro que es un pegote. */
const MAX_CELL = 5000;

export const importEntitySchema = z.enum(IMPORT_ENTITY_KEYS);

export const importModeSchema = z.enum(["crear", "actualizar", "mezclar"]);

export const importRunSchema = z.object({
  mode: importModeSchema.default("mezclar"),
  /** Por defecto se simula: escribir es una decisión explícita. */
  dryRun: z.boolean().default(true),
  /** Campo del CRM → origen del valor ("col:3", "const:ACTIVO" o vacío). */
  mapping: z.record(z.string().max(60), z.string().max(200)),
  rows: z
    .array(z.array(z.string().max(MAX_CELL)))
    .min(1, "El archivo no tiene filas con datos.")
    .max(MAX_IMPORT_ROWS, `El archivo supera las ${MAX_IMPORT_ROWS} filas.`),
  /**
   * Número de cada fila en el archivo, cuando llega un lote y no el archivo
   * entero: así el informe señala la fila real que hay que corregir.
   */
  lines: z.array(z.number().int().min(1)).max(MAX_IMPORT_ROWS).optional(),
}).refine((data) => !data.lines || data.lines.length === data.rows.length, {
  message: "Los números de fila no coinciden con las filas enviadas.",
  path: ["lines"],
});

export type ImportRunInput = z.infer<typeof importRunSchema>;
