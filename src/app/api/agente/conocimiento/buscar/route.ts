import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { searchKnowledge } from "@/server/services/knowledge";
import { knowledgeSearchSchema } from "@/server/validators/knowledge";

export const runtime = "nodejs";

/**
 * POST /api/agente/conocimiento/buscar — fragmentos de la base de
 * conocimiento que responden la consulta (productos, condiciones, políticas,
 * preguntas frecuentes). 503 si falta OPENAI_API_KEY.
 */
export const POST = route(async (request: NextRequest) => {
  await requireAgent(request);
  const input = knowledgeSearchSchema.parse(await readJson(request));

  return ok(await searchKnowledge(input));
});
