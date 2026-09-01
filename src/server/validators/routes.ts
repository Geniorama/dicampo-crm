import { z } from "zod";
import { RouteStatus } from "@/generated/prisma/enums";

/** Validación de rutas de reparto y evidencias de entrega. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const routeBaseSchema = z.object({
  name: z.string().trim().min(3, "Ponle un nombre a la ruta").max(100),
  date: z.coerce.date(),
  zoneId: z.string().cuid().optional(),
  driverId: z.string().cuid().optional(),
  vehicle: optionalText(80),
  notes: optionalText(1000),
});

export const routeCreateSchema = routeBaseSchema;

export type RouteFormValues = z.input<typeof routeCreateSchema>;
export type RouteCreateInput = z.output<typeof routeCreateSchema>;

export const routeUpdateSchema = routeBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type RouteUpdateInput = z.infer<typeof routeUpdateSchema>;

export const routeStatusSchema = z.object({
  status: z.enum(RouteStatus),
  reason: optionalText(500),
});

export type RouteStatusInput = z.infer<typeof routeStatusSchema>;

/**
 * Asignación de pedidos a la ruta.
 *
 * Se envía la lista completa en el orden de visita, no altas y bajas sueltas:
 * planear una ruta es decidir el recorrido entero, y mandarlo de una vez evita
 * quedarse con secuencias a medio renumerar.
 */
export const routeOrdersSchema = z.object({
  orderIds: z.array(z.string().cuid()),
});

export type RouteOrdersInput = z.infer<typeof routeOrdersSchema>;

export const routeListQuerySchema = z.object({
  status: z.enum(RouteStatus).optional(),
  zoneId: z.string().cuid().optional(),
  driverId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type RouteListQuery = z.infer<typeof routeListQuerySchema>;

/** Evidencia de entrega. La foto llega cuando esté R2; por ahora es opcional. */
export const deliveryProofSchema = z.object({
  receivedBy: z.string().trim().min(3, "¿Quién recibió?").max(120),
  receivedDoc: optionalText(30),
  photoKey: optionalText(200),
  notes: optionalText(1000),
});

export type DeliveryProofFormValues = z.input<typeof deliveryProofSchema>;
export type DeliveryProofInput = z.output<typeof deliveryProofSchema>;
