import { z } from "zod";

/** Validación de compras de fruta. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const purchaseCreateSchema = z.object({
  /** Fecha de calendario de la compra ("AAAA-MM-DD"). */
  date: z.coerce.date(),
  fruit: z.string().trim().min(2, "Indica la fruta").max(60),
  supplier: z.string().trim().min(2, "Indica el proveedor").max(120),
  kg: z.coerce.number().positive("Los kilos deben ser mayores que cero").max(100_000),
  /** Lo que se pagó por el lote; el recargo de excipientes lo suma el servidor. */
  baseCost: z.coerce.number().positive("El costo debe ser mayor que cero").max(1_000_000_000),
  notes: optionalText(500),
});

export type PurchaseFormValues = z.input<typeof purchaseCreateSchema>;
export type PurchaseCreateInput = z.output<typeof purchaseCreateSchema>;
