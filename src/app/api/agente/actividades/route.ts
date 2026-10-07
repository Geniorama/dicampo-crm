import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { logConversation } from "@/server/services/agent";
import { agentActivitySchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/** POST /api/agente/actividades — resumen de la conversación en la ficha. */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = agentActivitySchema.parse(await readJson(request));

  return created(await logConversation(agent, input));
});
