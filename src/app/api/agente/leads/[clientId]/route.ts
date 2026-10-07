import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateLead } from "@/server/services/agent";
import { leadUpdateSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

type Context = { params: Promise<{ clientId: string }> };

/** PATCH /api/agente/leads/:clientId — completa los datos del lead. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const agent = await requireAgent(request);
  const { clientId } = await context.params;
  const input = leadUpdateSchema.parse(await readJson(request));

  return ok(await updateLead(agent, clientId, input));
});
