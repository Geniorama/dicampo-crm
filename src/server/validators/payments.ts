import { z } from "zod";
import { ClientType, CollectionStatus, PaymentMethod, PaymentReceiver } from "@/generated/prisma/enums";

/** Validación de pagos y de la consulta de cartera. */

export const paymentCreateSchema = z.object({
  amount: z.coerce.number().positive("El valor debe ser mayor que cero").max(1_000_000_000),
  method: z.enum(PaymentMethod).default(PaymentMethod.EFECTIVO),
  /** Quién recibió el dinero. */
  receivedBy: z.enum(PaymentReceiver).optional(),
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
  clientType: z.enum(ClientType).optional(),
  collectionStatus: z.enum(CollectionStatus).optional(),
  /** Solo pedidos entregados en los últimos 1, 3 o 6 meses. */
  months: z.coerce.number().int().refine((n) => [1, 3, 6].includes(n)).optional(),
  /** Solo clientes con algo vencido. */
  overdueOnly: z
    .enum(["1", "true"])
    .optional()
    .transform((value) => value !== undefined),
});

export type ReceivablesQuery = z.infer<typeof receivablesQuerySchema>;

/** Gestión de cobro de un cliente: estado y observaciones. */
export const collectionUpdateSchema = z.object({
  collectionStatus: z.enum(CollectionStatus),
  collectionNote: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
});

export type CollectionUpdateInput = z.output<typeof collectionUpdateSchema>;
