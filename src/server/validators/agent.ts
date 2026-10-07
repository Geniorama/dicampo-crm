import { z } from "zod";
import { ClientType } from "@/generated/prisma/enums";
import { AGENT_STAGES } from "@/lib/agent-rules";
import { normalizePhone } from "@/lib/whatsapp";

/**
 * Contratos de `/api/agente/*`.
 *
 * Los campos van en español porque los consume el agente de n8n: son los
 * mismos nombres que ve el modelo en la definición de sus herramientas.
 */

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: mínimo ${min} caracteres`)
    .max(max, `${label}: máximo ${max} caracteres`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

/** Teléfono en cualquier formato; sale normalizado a E.164 sin "+". */
export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Teléfono no válido")
  .max(30)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Teléfono no válido" });
      return z.NEVER;
    }
    return normalized;
  });

const idSchema = z.string().cuid("Id no válido");

// ── Leads ────────────────────────────────────────────────────

export const leadLookupSchema = z.object({ telefono: phoneSchema });
export type LeadLookupInput = z.infer<typeof leadLookupSchema>;

export const leadCreateSchema = z.object({
  telefono: phoneSchema,
  nombreContacto: text(2, 100, "nombreContacto"),
  /** Nombre del negocio, si ya lo dijo */
  negocio: optionalText(200),
  tipo: z.enum(ClientType).optional(),
});
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadUpdateSchema = z
  .object({
    razonSocial: text(3, 200, "razonSocial").optional(),
    nombreComercial: optionalText(200),
    tipo: z.enum(ClientType).optional(),
    correo: z.string().trim().email("Correo no válido").optional(),
    nombreContacto: text(2, 100, "nombreContacto").optional(),
    cargoContacto: optionalText(100),
    sede: z
      .object({
        direccion: text(5, 200, "direccion"),
        barrio: optionalText(100),
        ciudad: z.string().trim().max(100).default("Bogotá"),
        indicaciones: optionalText(1000),
      })
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "No se envió ningún campo para actualizar.",
  });
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

// ── Oportunidades ────────────────────────────────────────────

export const opportunityUpsertSchema = z.object({
  clientId: idSchema,
  interes: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(40),
        kilosMes: z.coerce
          .number()
          .positive("kilosMes debe ser mayor que cero")
          .max(100_000),
      }),
    )
    .min(1, "Indica al menos un producto de interés")
    .max(30),
  notas: optionalText(2000),
});
export type OpportunityUpsertInput = z.infer<typeof opportunityUpsertSchema>;

export const agentStageSchema = z.object({
  etapa: z.enum(AGENT_STAGES, {
    message: `etapa debe ser ${AGENT_STAGES.join(", ")}`,
  }),
});
export type AgentStageInput = z.infer<typeof agentStageSchema>;

// ── Bitácora, visitas y escalamiento ─────────────────────────

export const agentActivitySchema = z.object({
  clientId: idSchema,
  asunto: text(3, 200, "asunto"),
  notas: optionalText(5000),
});
export type AgentActivityInput = z.infer<typeof agentActivitySchema>;

export const visitSchema = z.object({
  clientId: idSchema,
  /** Fecha y hora acordadas, ISO 8601 con zona: "2026-10-09T10:00:00-05:00" */
  fecha: z.iso.datetime({
    offset: true,
    message: 'fecha debe ser ISO 8601 con zona, p. ej. "2026-10-09T10:00:00-05:00"',
  }),
  direccion: text(5, 200, "direccion"),
  barrio: optionalText(100),
  ciudad: z.string().trim().max(100).default("Bogotá"),
  notas: optionalText(2000),
});
export type VisitInput = z.infer<typeof visitSchema>;

export const escalateSchema = z.object({
  telefono: phoneSchema,
  motivo: text(3, 200, "motivo"),
  resumen: text(3, 5000, "resumen"),
});
export type EscalateInput = z.infer<typeof escalateSchema>;
