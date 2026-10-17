import { z } from "zod";
import {
  findOverlappingWindows,
  minutesToTime,
  timeToMinutes,
} from "@/lib/visit-schedule";

/** Validación de la disponibilidad de visitas de cada asesor. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

/** "HH:MM" → minutos desde la medianoche de Bogotá. */
const timeSchema = z
  .string()
  .refine((value) => !Number.isNaN(timeToMinutes(value)), {
    message: "Hora no válida (usa HH:MM)",
  })
  .transform(timeToMinutes);

/**
 * Día "AAAA-MM-DD". Se deja como texto: convertirlo en `Date` aquí lo ataría
 * a la zona del servidor; el servicio lo interpreta en hora de Bogotá.
 */
const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha no válido (AAAA-MM-DD)");

export const windowSchema = z
  .object({
    /** Día ISO: 1 = lunes … 7 = domingo */
    weekday: z.coerce.number().int().min(1).max(7),
    start: timeSchema,
    end: timeSchema,
  })
  .refine((window) => window.end > window.start, {
    path: ["end"],
    message: "La hora final debe ser posterior a la inicial",
  })
  .transform(({ weekday, start, end }) => ({
    weekday,
    startMinute: start,
    endMinute: end,
  }));

export const scheduleUpdateSchema = z
  .object({
    acceptsVisits: z.boolean(),
    visitMinutes: z.coerce
      .number()
      .int()
      .min(15, "Mínimo 15 minutos")
      .max(240, "Máximo 4 horas"),
    bufferMinutes: z.coerce.number().int().min(0).max(240),
    minLeadDays: z.coerce.number().int().min(0).max(14),
    maxDaysAhead: z.coerce.number().int().min(1).max(90),
    windows: z.array(windowSchema).max(50),
  })
  .superRefine((data, context) => {
    const overlapping = findOverlappingWindows(data.windows);
    if (overlapping.length > 0) {
      const first = overlapping[0];
      context.addIssue({
        code: "custom",
        path: ["windows"],
        message: `Hay franjas que se cruzan el mismo día (${minutesToTime(first.startMinute)}–${minutesToTime(first.endMinute)}).`,
      });
    }
    if (data.minLeadDays > data.maxDaysAhead) {
      context.addIssue({
        code: "custom",
        path: ["maxDaysAhead"],
        message: "El horizonte debe ser mayor que la anticipación mínima.",
      });
    }
  });

export type ScheduleUpdateInput = z.output<typeof scheduleUpdateSchema>;

/** Ausencia: días completos o un rango de horas. */
export const blockCreateSchema = z
  .object({
    fromDate: dateKeySchema,
    toDate: dateKeySchema,
    startTime: z
      .string()
      .optional()
      .transform((value) => (value ? timeToMinutes(value) : 0)),
    endTime: z
      .string()
      .optional()
      .transform((value) => (value ? timeToMinutes(value) : 24 * 60)),
    reason: optionalText(200),
  })
  .refine((data) => !Number.isNaN(data.startTime) && !Number.isNaN(data.endTime), {
    path: ["startTime"],
    message: "Hora no válida (usa HH:MM)",
  })
  .refine(
    (data) =>
      data.toDate > data.fromDate ||
      (data.toDate === data.fromDate && data.endTime > data.startTime),
    { path: ["toDate"], message: "La ausencia debe terminar después de empezar" },
  );

export type BlockCreateInput = z.output<typeof blockCreateSchema>;

export const visitAgendaQuerySchema = z.object({
  userId: z.string().cuid().optional(),
  from: dateKeySchema.optional(),
  days: z.coerce.number().int().min(1).max(31).default(14),
  /** "1" incluye las visitas ya realizadas. */
  includeDone: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
});

export type VisitAgendaQuery = z.output<typeof visitAgendaQuerySchema>;
