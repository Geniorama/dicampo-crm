import type { OpportunityStage } from "@/generated/prisma/enums";
import { isClosedStage } from "./pipeline-stages";

/**
 * Reglas del agente IA de WhatsApp que no necesitan base de datos: a quién se
 * asigna un lead, qué etapas puede tocar y cómo se valora el interés que
 * declara un prospecto. Viven aquí, como `pipeline-stages.ts`, para probarlas
 * sin Postgres.
 */

// ── Rotación de vendedores ───────────────────────────────────

export type SellerLoad = {
  id: string;
  /** Clientes en PROSPECTO que tiene asignados hoy */
  prospectCount: number;
  /** Último cliente que recibió, o `null` si nunca recibió uno */
  lastAssignedAt: Date | null;
};

/**
 * Elige al vendedor que recibe un lead nuevo: el que tiene menos prospectos;
 * en empate, el que lleva más tiempo sin recibir uno (quien nunca recibió va
 * primero). El id desempata al final para que el resultado sea estable.
 * Devuelve `null` si no hay vendedores.
 */
export function pickSeller(sellers: readonly SellerLoad[]): string | null {
  const sorted = [...sellers].sort((a, b) => {
    if (a.prospectCount !== b.prospectCount) {
      return a.prospectCount - b.prospectCount;
    }
    const aTime = a.lastAssignedAt?.getTime() ?? -Infinity;
    const bTime = b.lastAssignedAt?.getTime() ?? -Infinity;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });

  return sorted[0]?.id ?? null;
}

// ── Etapas ───────────────────────────────────────────────────

/**
 * Etapas que el agente puede fijar. PROSPECTO es el punto de partida, y
 * GANADA y PERDIDA son decisión de un vendedor: el agente nunca cierra.
 */
export const AGENT_STAGES = [
  "CONTACTADO",
  "MUESTRA_ENVIADA",
  "NEGOCIACION",
] as const satisfies readonly OpportunityStage[];

export type AgentStage = (typeof AGENT_STAGES)[number];

/**
 * Motivo por el que el agente no puede mover la oportunidad, o `null` si
 * puede. Una oportunidad cerrada ya la decidió un vendedor.
 */
export function agentStageBlocker(
  current: OpportunityStage,
  target: OpportunityStage,
): string | null {
  if (!(AGENT_STAGES as readonly string[]).includes(target)) {
    return `El agente solo puede mover oportunidades a ${AGENT_STAGES.join(", ")}.`;
  }
  if (isClosedStage(current)) {
    return "La oportunidad ya está cerrada: solo un vendedor puede reabrirla.";
  }
  return null;
}

/**
 * Etapa que toma una oportunidad abierta cuando el lead acepta una visita:
 * pasa a CONTACTADO si seguía en PROSPECTO, y no retrocede si ya iba más
 * adelante.
 */
export function stageAfterVisit(current: OpportunityStage): OpportunityStage {
  return current === "PROSPECTO" ? "CONTACTADO" : current;
}

// ── Valoración del interés ───────────────────────────────────

export type InterestLine = { sku: string; kilosPerMonth: number };

export type PricedVariant = {
  id: string;
  sku: string;
  label: string;
  /** Peso neto de una unidad en gramos (KILO = 1000, LIBRA = 500) */
  netWeightG: number;
};

export type ValuedLine = {
  sku: string;
  label: string;
  kilosPerMonth: number;
  units: number;
  unitPrice: number | null;
  subtotal: number;
};

/**
 * Valora en COP el consumo mensual que declara un prospecto.
 *
 * El agente habla en kilos al mes; la lista de precios cobra por unidad de
 * la variante (kilo o libra), así que los kilos se pasan a unidades antes de
 * buscar el escalón. Una variante sin precio no suma y se informa aparte: el
 * agente nunca inventa un valor.
 */
export function valueInterest(
  lines: readonly InterestLine[],
  variants: ReadonlyMap<string, PricedVariant>,
  unitPriceFor: (variantId: string, units: number) => number | null,
): { total: number; lines: ValuedLine[]; withoutPrice: string[] } {
  const valued: ValuedLine[] = [];
  const withoutPrice: string[] = [];

  for (const line of lines) {
    const variant = variants.get(line.sku);
    if (!variant) {
      throw new Error(`Variante desconocida: ${line.sku}`);
    }

    const units = roundTo((line.kilosPerMonth * 1000) / variant.netWeightG, 3);
    const unitPrice = unitPriceFor(variant.id, units);
    if (unitPrice === null) withoutPrice.push(variant.sku);

    valued.push({
      sku: variant.sku,
      label: variant.label,
      kilosPerMonth: line.kilosPerMonth,
      units,
      unitPrice,
      subtotal: unitPrice === null ? 0 : Math.round(units * unitPrice),
    });
  }

  return {
    total: valued.reduce((acc, line) => acc + line.subtotal, 0),
    lines: valued,
    withoutPrice,
  };
}

/**
 * Texto del interés para la bitácora, legible por un vendedor:
 * "Pulpa de Mango (kilo): 20 kg/mes × $15.952 = $319.040".
 */
export function describeInterest(
  lines: readonly ValuedLine[],
  formatMoney: (value: number) => string,
): string {
  return lines
    .map((line) => {
      const qty = `${formatNumber(line.kilosPerMonth)} kg/mes`;
      if (line.unitPrice === null) {
        return `${line.label}: ${qty} (sin precio en la lista)`;
      }
      return `${line.label}: ${qty} × ${formatMoney(line.unitPrice)} = ${formatMoney(line.subtotal)}`;
    })
    .join("\n");
}

const INTEREST_MARKER = "— Interés declarado por WhatsApp —";

/**
 * Las notas de la oportunidad terminan con el interés vigente. Al revalorar
 * se reemplaza solo ese bloque: lo que haya escrito el vendedor arriba se
 * conserva, y el historial de cada valoración queda en la bitácora.
 */
export function withInterestBlock(notes: string | null, breakdown: string): string {
  const index = notes?.indexOf(INTEREST_MARKER) ?? -1;
  const head = (index >= 0 ? notes!.slice(0, index) : (notes ?? "")).trimEnd();
  return [head, `${INTEREST_MARKER}\n${breakdown}`].filter(Boolean).join("\n\n");
}

/** Sumar kilos repetidos del mismo SKU: el agente puede mandarlo dos veces. */
export function mergeInterest(lines: readonly InterestLine[]): InterestLine[] {
  const bySku = new Map<string, number>();
  for (const line of lines) {
    const sku = line.sku.trim().toUpperCase();
    bySku.set(sku, (bySku.get(sku) ?? 0) + line.kilosPerMonth);
  }
  return [...bySku].map(([sku, kilosPerMonth]) => ({ sku, kilosPerMonth }));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}
