import { z } from "zod";
import { BillingMode, QuoteStatus } from "@/generated/prisma/enums";
import { orderItemSchema } from "./orders";
import { localDateSchema } from "./reports";

/** Validación de cotizaciones. Las líneas son las mismas que las de un pedido. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const quoteCreateSchema = z.object({
  clientId: z.string().cuid(),
  addressId: z.string().cuid().optional(),
  /** Fecha límite de la oferta; por defecto, la vigencia estándar. */
  validUntil: z.coerce.date().optional(),
  /** Si no se envía, rige la del cliente. */
  billingMode: z.enum(BillingMode).optional(),
  /**
   * Descuento sobre todas las líneas (15 = 15 %). Si no se envía, rige el que
   * corresponde al cliente (nuevo, negociación o 0); el servidor valida los
   * topes: ver `lib/quote-discount.ts`.
   */
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  notes: optionalText(2000),
  items: z.array(orderItemSchema).min(1, "La cotización necesita al menos un producto."),
});

export type QuoteFormValues = z.input<typeof quoteCreateSchema>;
export type QuoteCreateInput = z.output<typeof quoteCreateSchema>;

/** Solo se edita el contenido mientras la cotización sea BORRADOR. */
export const quoteUpdateSchema = quoteCreateSchema
  .partial()
  .omit({ clientId: true });

export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;

export const quoteStatusChangeSchema = z.object({
  status: z.enum(QuoteStatus),
  /** Obligatorio al rechazar: alimenta el análisis de pérdidas. */
  reason: optionalText(500),
});

export type QuoteStatusChangeInput = z.infer<typeof quoteStatusChangeSchema>;

export const quoteConvertSchema = z.object({
  requestedDeliveryDate: z.coerce.date().optional(),
});

export type QuoteConvertInput = z.infer<typeof quoteConvertSchema>;

export const quoteListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(QuoteStatus).optional(),
  clientId: z.string().cuid().optional(),
  sellerId: z.string().cuid().optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
