import { z } from "zod";

/** Validación de tandas de producción. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const batchCreateSchema = z
  .object({
    productId: z.string().cuid(),
    date: z.coerce.date(),
    /** Kilos de fruta que entraron a despulpar. */
    fruitKg: z.coerce.number().positive("Indica los kilos de fruta").max(100_000),
    /** Pulpa para la venta: se vuelve un lote con FEFO. */
    publicKg: z.coerce.number().min(0).max(100_000),
    /** Pulpa a granel: se contabiliza pero no se vende por el catálogo. */
    bulkKg: z.coerce.number().min(0).max(100_000),
    /** Vencimiento del lote de pulpa pública; obligatorio si hay pulpa pública. */
    expiryDate: z.coerce.date().optional(),
    notes: optionalText(500),
  })
  .refine((data) => data.publicKg + data.bulkKg > 0, {
    path: ["publicKg"],
    message: "Reparte al menos un kilo de pulpa.",
  })
  .refine((data) => data.publicKg + data.bulkKg <= data.fruitKg, {
    path: ["publicKg"],
    message: "La pulpa no puede pesar más que la fruta recibida.",
  })
  .refine((data) => data.publicKg === 0 || Boolean(data.expiryDate), {
    path: ["expiryDate"],
    message: "Indica el vencimiento del lote.",
  });

export type BatchFormValues = z.input<typeof batchCreateSchema>;
export type BatchCreateInput = z.output<typeof batchCreateSchema>;
