import { z } from "zod";
import { OrderChannel, OrderStatus, PaymentStatus } from "@/generated/prisma/enums";

/** Validación de pedidos y de sus transiciones de estado. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const orderItemSchema = z.object({
  variantId: z.string().cuid(),
  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(100_000),
  /**
   * Precio unitario. Si no se envía, lo resuelve el servidor desde la lista
   * de precios del cliente. Enviarlo permite un precio pactado puntual.
   */
  unitPrice: z.coerce.number().min(0).optional(),
  /** Descuento en pesos sobre el total de la línea. */
  discount: z.coerce.number().min(0).default(0),
});

export type OrderItemInput = z.output<typeof orderItemSchema>;

export const orderCreateSchema = z.object({
  clientId: z.string().cuid(),
  addressId: z.string().cuid().optional(),
  channel: z.enum(OrderChannel).default(OrderChannel.WHATSAPP),
  requestedDeliveryDate: z.coerce.date().optional(),
  notes: optionalText(2000),
  items: z.array(orderItemSchema).min(1, "El pedido necesita al menos un producto."),
});

export type OrderFormValues = z.input<typeof orderCreateSchema>;
export type OrderCreateInput = z.output<typeof orderCreateSchema>;

/** Solo se puede editar el contenido mientras el pedido esté en BORRADOR. */
export const orderUpdateSchema = orderCreateSchema.partial().omit({ clientId: true });

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

export const orderStatusChangeSchema = z.object({
  status: z.enum(OrderStatus),
  /** Obligatorio al cancelar: queda como trazabilidad. */
  reason: optionalText(500),
});

export type OrderStatusChangeInput = z.infer<typeof orderStatusChangeSchema>;

export const orderListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(OrderStatus).optional(),
  paymentStatus: z.enum(PaymentStatus).optional(),
  clientId: z.string().cuid().optional(),
  sellerId: z.string().cuid().optional(),
  routeId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
