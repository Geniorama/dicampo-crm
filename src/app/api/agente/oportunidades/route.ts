import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { upsertOpportunity } from "@/server/services/agent";
import { opportunityUpsertSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/**
 * POST /api/agente/oportunidades — registra el interés del prospecto en kilos
 * al mes por SKU. El CRM calcula el valor; si el cliente ya tiene una
 * oportunidad abierta, la revalora (200) en vez de duplicarla (201).
 */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = opportunityUpsertSchema.parse(await readJson(request));

  const result = await upsertOpportunity(agent, input);
  return result.creada ? created(result) : ok(result);
});
