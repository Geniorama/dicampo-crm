import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { moveOpportunityStage } from "@/server/services/agent";
import { agentStageSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/agente/oportunidades/:id/etapa — solo CONTACTADO,
 * MUESTRA_ENVIADA o NEGOCIACION. Ganar o perder es decisión de un vendedor.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const agent = await requireAgent(request);
  const { id } = await context.params;
  const input = agentStageSchema.parse(await readJson(request));

  return ok(await moveOpportunityStage(agent, id, input));
});
