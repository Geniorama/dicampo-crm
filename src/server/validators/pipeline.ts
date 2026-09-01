import { z } from "zod";
import { ActivityType, OpportunityStage } from "@/generated/prisma/enums";

/** Validación de oportunidades comerciales y de la bitácora de actividades. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

// ── Oportunidades ────────────────────────────────────────────

const opportunityBaseSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().trim().min(3, "Ponle un título a la oportunidad").max(150),
  stage: z.enum(OpportunityStage).default(OpportunityStage.PROSPECTO),
  /** Valor mensual estimado en COP. */
  estimatedValue: z.coerce
    .number()
    .min(0, "El valor no puede ser negativo")
    .default(0),
  ownerId: z.string().cuid().optional(),
  expectedCloseDate: z.coerce.date().optional(),
  notes: optionalText(2000),
});

export const opportunityCreateSchema = opportunityBaseSchema;

export type OpportunityFormValues = z.input<typeof opportunityCreateSchema>;
export type OpportunityCreateInput = z.output<typeof opportunityCreateSchema>;

export const opportunityUpdateSchema = opportunityBaseSchema
  .partial()
  .omit({ clientId: true })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;

/**
 * Cambio de etapa. A diferencia de los pedidos, el pipeline no es una máquina
 * de estados rígida: en ventas se retrocede de etapa con normalidad. La única
 * regla es que perder una oportunidad exige explicar por qué.
 */
export const opportunityStageSchema = z
  .object({
    stage: z.enum(OpportunityStage),
    lostReason: optionalText(500),
  })
  .refine(
    (data) => data.stage !== OpportunityStage.PERDIDA || Boolean(data.lostReason),
    {
      path: ["lostReason"],
      message: "Indica por qué se perdió la oportunidad.",
    },
  );

export type OpportunityStageInput = z.infer<typeof opportunityStageSchema>;

export const opportunityListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: z.enum(OpportunityStage).optional(),
  ownerId: z.string().cuid().optional(),
  clientId: z.string().cuid().optional(),
  /** "1" incluye las cerradas (ganadas y perdidas) en el tablero. */
  includeClosed: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
});

export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;

// ── Actividades ──────────────────────────────────────────────

export const activityCreateSchema = z
  .object({
    type: z.enum(ActivityType),
    subject: z.string().trim().min(3, "Describe la actividad").max(200),
    notes: optionalText(2000),
    clientId: z.string().cuid().optional(),
    contactId: z.string().cuid().optional(),
    opportunityId: z.string().cuid().optional(),
    orderId: z.string().cuid().optional(),
    /** Fecha compromiso; si se envía, la actividad nace pendiente. */
    dueAt: z.coerce.date().optional(),
    /** Marca la actividad como ya realizada al registrarla. */
    completed: z.boolean().default(true),
  })
  .refine(
    (data) =>
      Boolean(data.clientId || data.opportunityId || data.orderId),
    {
      message:
        "La actividad debe estar asociada a un cliente, una oportunidad o un pedido.",
    },
  );

export type ActivityFormValues = z.input<typeof activityCreateSchema>;
export type ActivityCreateInput = z.output<typeof activityCreateSchema>;

export const activityListQuerySchema = z.object({
  clientId: z.string().cuid().optional(),
  opportunityId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  /** "1" devuelve solo las pendientes (sin completar). */
  onlyPending: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
