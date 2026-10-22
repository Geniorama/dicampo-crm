import { z } from "zod";
import { MONTH_PATTERN } from "@/lib/goals";

/** Validación de metas mensuales. */

const month = z.string().regex(MONTH_PATTERN, "El mes debe ser AAAA-MM");

export const goalUpsertSchema = z.object({
  month,
  /** Sin asesor, es la meta general de la empresa. */
  userId: z.string().cuid().optional(),
  /** Meta de ventas del mes, en pesos. */
  salesTarget: z.coerce.number().min(0, "La meta no puede ser negativa").max(100_000_000_000),
  /** Meta de clientes nuevos del mes. */
  newClientsTarget: z.coerce.number().int().min(0).max(10_000),
});

export type GoalUpsertInput = z.output<typeof goalUpsertSchema>;

export const goalMonthQuerySchema = z.object({ mes: month.optional() });
