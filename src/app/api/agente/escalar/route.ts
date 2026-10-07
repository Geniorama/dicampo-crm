import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { escalate } from "@/server/services/agent";
import { escalateSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/**
 * POST /api/agente/escalar — pasa la conversación a una persona: estado
 * HUMANO y tarea pendiente en la agenda del vendedor. El bot no responde
 * hasta que la liberen.
 */
export const POST = route(async (request: NextRequest) => {
  await requireAgent(request);
  const input = escalateSchema.parse(await readJson(request));

  return ok(await escalate(input));
});
