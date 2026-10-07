import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getConversationState } from "@/server/services/conversations";
import { phoneQuerySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * GET /api/agente/conversaciones/estado?telefono= — quién responde, qué
 * autorizó la persona, último entrante (para el buffer) y ventana de 24 h.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAgent(request);
  const { telefono } = phoneQuerySchema.parse({
    telefono: request.nextUrl.searchParams.get("telefono") ?? "",
  });

  return ok(await getConversationState(telefono));
});
