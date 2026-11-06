import { z } from "zod";
import { VisitCategory } from "@/generated/prisma/enums";

/**
 * Registro de una visita comercial. Hay dos tipos:
 * - NUEVO: demostración a un negocio que aún no está en la base (el nombre se
 *   escribe a mano y se crea como prospecto).
 * - FIDELIZACION: visita a un cliente actual, por uno de cuatro motivos.
 */

export const VISIT_REASONS = [
  "RECAPACITACION",
  "RECUPERACION",
  "ENTREGA_PEDIDOS",
  "DEVOLUCION_FALTANTES",
] as const;

export type VisitReason = (typeof VISIT_REASONS)[number];

const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max);

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indica la fecha de la visita");
const timeText = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Indica la hora de la visita");

const common = {
  visitDate: dateText,
  visitTime: timeText,
  /** Categoría de la etiqueta; si no se envía, la del tipo de visita. */
  category: z.enum(VisitCategory).optional(),
};

export const visitCreateSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("NUEVO"),
    ...common,
    businessName: text(3, 200, "Escribe el nombre del negocio"),
    contactName: text(2, 100, "Indica con quién es la visita"),
    locality: text(2, 100, "Indica la localidad"),
    address: text(5, 200, "Indica la dirección"),
    /** Muestra que se lleva: no descuenta inventario. */
    sampleQuantity: z.coerce.number().positive("Indica la cantidad de la muestra").max(1000),
    sampleFlavor: text(2, 100, "Indica el sabor de la muestra"),
  }),
  z.object({
    kind: z.literal("FIDELIZACION"),
    ...common,
    clientId: z.string().cuid("Elige el cliente"),
    reason: z.enum(VISIT_REASONS),
  }),
]);

export type VisitFormValues = z.input<typeof visitCreateSchema>;
export type VisitCreateInput = z.output<typeof visitCreateSchema>;
