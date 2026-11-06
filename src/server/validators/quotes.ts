import { z } from "zod";
import { BillingMode, ClientType, QuoteStatus } from "@/generated/prisma/enums";
import { onlyDigits } from "@/lib/nit";
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

const requiredText = (message: string, max = 255) => z.string().trim().min(1, message).max(max);

/** Una sede del cliente nuevo, con quién recibe ahí. */
export const newClientAddressSchema = z.object({
  label: optionalText(120),
  locality: requiredText("La localidad es obligatoria", 100),
  neighborhood: optionalText(120),
  address: requiredText("La dirección es obligatoria", 255),
  contactName: requiredText("El contacto de la sede es obligatorio", 120),
  whatsapp: requiredText("El WhatsApp de la sede es obligatorio", 50),
});

/** Cliente que se crea al cotizar: queda como prospecto del asesor. */
export const newClientSchema = z.object({
  businessName: requiredText("El nombre es obligatorio", 200).min(3, "El nombre es muy corto"),
  nit: z
    .string()
    .trim()
    .transform(onlyDigits)
    .refine((value) => value === "" || (value.length >= 5 && value.length <= 15), {
      message: "La cédula o NIT debe tener entre 5 y 15 dígitos",
    })
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  phone: requiredText("El teléfono o WhatsApp es obligatorio", 50),
  email: z.string().trim().email("Correo no válido").optional().or(z.literal("").transform(() => undefined)),
  type: z.enum(ClientType),
  priceListId: z.string().cuid("Elige la lista de precios"),
  billingMode: z.enum(BillingMode),
  notes: optionalText(2000),
  addresses: z.array(newClientAddressSchema).min(1, "Agrega al menos una sede"),
  /** Sede (posición en `addresses`) a la que va este pedido. */
  deliveryAddressIndex: z.coerce.number().int().min(0).default(0),
});

export type NewClientInput = z.output<typeof newClientSchema>;

export const quoteCreateSchema = z
  .object({
    /** Cliente actual. Si no se envía, debe venir `newClient`. */
    clientId: z.string().cuid().optional(),
    newClient: newClientSchema.optional(),
    addressId: z.string().cuid().optional(),
    /** Asesor de la venta: un ADMIN elige; un vendedor siempre es él. */
    sellerId: z.string().cuid().optional(),
    /** Solo con cliente actual: 0 a 8 %. El 15 % es del cliente nuevo y lo fija el servidor. */
    discountPercent: z.coerce.number().min(0).max(100).optional(),
    notes: optionalText(2000),
    items: z.array(orderItemSchema).min(1, "La cotización necesita al menos un producto."),
  })
  .refine((data) => Boolean(data.clientId) !== Boolean(data.newClient), {
    message: "Elige un cliente actual o registra uno nuevo.",
    path: ["clientId"],
  });

export type QuoteFormValues = z.input<typeof quoteCreateSchema>;
export type QuoteCreateInput = z.output<typeof quoteCreateSchema>;

export const quoteStatusChangeSchema = z.object({
  status: z.enum(QuoteStatus),
  /** Obligatorio al anular: queda en la cotización y en el pedido. */
  reason: optionalText(500),
});

export type QuoteStatusChangeInput = z.infer<typeof quoteStatusChangeSchema>;

export const quoteListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(QuoteStatus).optional(),
  clientId: z.string().cuid().optional(),
  sellerId: z.string().cuid().optional(),
  /** Un solo día (el de Bogotá); equivale a desde = hasta. */
  day: localDateSchema.optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
