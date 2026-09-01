import type { OpportunityStage } from "@/generated/prisma/enums";

/**
 * Semántica de las etapas del pipeline.
 *
 * Vive en `lib/` porque la necesitan el servidor (para decidir qué campos
 * escribir al mover una oportunidad) y el tablero del navegador (para saber
 * qué columnas pintar). Es pura: no toca la base de datos.
 */

/** Etapas abiertas, en el orden en que se muestran las columnas. */
export const OPEN_STAGES: OpportunityStage[] = [
  "PROSPECTO",
  "CONTACTADO",
  "MUESTRA_ENVIADA",
  "NEGOCIACION",
];

/** Etapas que cierran la oportunidad. */
export const CLOSED_STAGES: OpportunityStage[] = ["GANADA", "PERDIDA"];

export const ALL_STAGES: OpportunityStage[] = [...OPEN_STAGES, ...CLOSED_STAGES];

export function isClosedStage(stage: OpportunityStage): boolean {
  return CLOSED_STAGES.includes(stage);
}

/**
 * Campos que hay que fijar al mover una oportunidad de etapa.
 *
 * Cerrarla estampa la fecha; reabrirla la limpia junto con el motivo de
 * pérdida, para que no quede un "perdida por X" colgando de una oportunidad
 * que volvió a estar viva.
 */
export function stageTransitionFields(
  stage: OpportunityStage,
  lostReason?: string,
  now: Date = new Date(),
): { closedAt: Date | null; lostReason: string | null } {
  if (!isClosedStage(stage)) {
    return { closedAt: null, lostReason: null };
  }

  return {
    closedAt: now,
    lostReason: stage === "PERDIDA" ? (lostReason ?? null) : null,
  };
}

/**
 * Al ganar una oportunidad, un cliente que seguía como PROSPECTO pasa a
 * ACTIVO: es exactamente lo que significa haber ganado.
 */
export function shouldActivateClient(
  stage: OpportunityStage,
  currentClientStatus: string,
): boolean {
  return stage === "GANADA" && currentClientStatus === "PROSPECTO";
}
