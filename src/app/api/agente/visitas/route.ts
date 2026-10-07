import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { scheduleVisit } from "@/server/services/agent";
import { visitSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/**
 * POST /api/agente/visitas — el lead aceptó una visita presencial. Queda en
 * la agenda del vendedor y la conversación pasa a HUMANO.
 */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = visitSchema.parse(await readJson(request));

  return created(await scheduleVisit(agent, input));
});
