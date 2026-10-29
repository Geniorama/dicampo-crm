import { z } from "zod";
import {
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTerms,
} from "@/generated/prisma/enums";

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
  /**
   * A qué asesor se atribuye la venta. Solo lo elige quien no es VENDEDOR
   * (un vendedor siempre vende a su nombre); si falta, el responsable del
   * cliente.
   */
  sellerId: z.string().cuid().optional(),
  items: z.array(orderItemSchema).min(1, "El pedido necesita al menos un producto."),
});

export type OrderFormValues = z.input<typeof orderCreateSchema>;
export type OrderCreateInput = z.output<typeof orderCreateSchema>;

/** Solo se puede editar el contenido mientras el pedido esté en BORRADOR. */
// `.partial()` conserva los `.default()`: un PATCH parcial reiniciaría esos campos.
export const orderUpdateSchema = orderCreateSchema
  .extend({ channel: z.enum(OrderChannel) })
  .partial()
  // El vendedor se cambia por su propio endpoint, en cualquier estado.
  .omit({ clientId: true, sellerId: true });

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;

/** Un ADMIN corrige a qué asesor se atribuye un pedido, en cualquier estado. */
export const orderSellerSchema = z.object({
  sellerId: z.string().cuid("Elige el vendedor."),
});

export type OrderSellerInput = z.infer<typeof orderSellerSchema>;

/**
 * Pedido histórico cargado por archivo: una venta que ya ocurrió. Entra
 * ENTREGADO, con los precios con que se vendió y sin tocar inventario.
 */
export const historicalOrderSchema = z
  .object({
    externalRef: z.string().trim().min(1, "Falta el número del pedido").max(60),
    clientId: z.string().cuid(),
    addressId: z.string().cuid().optional(),
    sellerId: z.string().cuid().optional(),
    channel: z.enum(OrderChannel).default(OrderChannel.WHATSAPP),
    paymentTerms: z.enum(PaymentTerms).optional(),
    orderDate: z.date(),
    deliveredAt: z.date(),
    notes: optionalText(2000),
    items: z.array(orderItemSchema).min(1, "El pedido necesita al menos un producto."),
    /** Lo cobrado. Sin dato, el pedido se toma como pagado completo. */
    paidAmount: z.number().min(0, "Lo pagado no puede ser negativo").optional(),
    paymentMethod: z.enum(PaymentMethod).default(PaymentMethod.OTRO),
  })
  .refine((data) => data.deliveredAt >= data.orderDate, {
    message: "La fecha de entrega no puede ser anterior a la del pedido.",
    path: ["deliveredAt"],
  });

export type HistoricalOrderInput = z.output<typeof historicalOrderSchema>;

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
