import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";

/** Validación de pagos y de la consulta de cartera. */

export const paymentCreateSchema = z.object({
  amount: z.coerce.number().positive("El valor debe ser mayor que cero").max(1_000_000_000),
  method: z.enum(PaymentMethod).default(PaymentMethod.EFECTIVO),
  /** Fecha en que se recibió el dinero; por defecto, ahora. */
  paidAt: z.coerce.date().optional(),
  reference: z
    .string()
    .trim()
    .max(120)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
});

export type PaymentFormValues = z.input<typeof paymentCreateSchema>;
export type PaymentCreateInput = z.output<typeof paymentCreateSchema>;

export const receivablesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  ownerId: z.string().cuid().optional(),
  /** Solo clientes con algo vencido. */
  overdueOnly: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined),
});

export type ReceivablesQuery = z.infer<typeof receivablesQuerySchema>;
