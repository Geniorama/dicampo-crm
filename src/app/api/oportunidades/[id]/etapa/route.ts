import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeOpportunityStage } from "@/server/services/pipeline";
import { opportunityStageSchema } from "@/server/validators/pipeline";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/oportunidades/:id/etapa — mueve la oportunidad de columna.
 * Ganarla activa al cliente si seguía como prospecto.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = opportunityStageSchema.parse(await readJson(request));

  return ok(await changeOpportunityStage(user, id, input));
});
