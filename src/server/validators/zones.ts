import { z } from "zod";

/** Validación de las zonas de entrega. */

const description = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value === "" ? null : value))
  .optional();

export const zoneCreateSchema = z.object({
  name: z.string().trim().min(2, "Ponle un nombre a la zona").max(60),
  /** Qué localidades o barrios cubre. */
  description,
});

export type ZoneCreateInput = z.output<typeof zoneCreateSchema>;

/** Las zonas no se borran: sedes y rutas las referencian. Se desactivan. */
export const zoneUpdateSchema = zoneCreateSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type ZoneUpdateInput = z.output<typeof zoneUpdateSchema>;
