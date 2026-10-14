import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getConversationContext } from "@/server/services/conversations";
import { contextQuerySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * GET /api/agente/conversaciones/contexto?telefono=&limite= — estado, ficha
 * del lead, últimos mensajes y el bloque de entrantes por responder. Es lo
 * que n8n consulta antes de llamar al modelo.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAgent(request);
  const query = contextQuerySchema.parse({
    telefono: request.nextUrl.searchParams.get("telefono") ?? "",
    limite: request.nextUrl.searchParams.get("limite") ?? undefined,
  });

  return ok(await getConversationContext(query.telefono, query.limite));
});
