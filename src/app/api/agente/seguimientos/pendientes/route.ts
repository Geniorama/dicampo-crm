import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, route } from "@/server/http";
import { listPendingFollowUps } from "@/server/services/conversations";
import { pendingFollowUpsQuerySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * GET /api/agente/seguimientos/pendientes?limite= — conversaciones con
 * seguimiento vencido: en BOT, con autorización comercial, sin baja ni
 * descarte y con menos de tres seguimientos enviados.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAgent(request);
  const { limite } = pendingFollowUpsQuerySchema.parse({
    limite: request.nextUrl.searchParams.get("limite") ?? undefined,
  });

  return ok(await listPendingFollowUps(limite));
});
