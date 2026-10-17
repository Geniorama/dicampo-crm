import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getVisitAvailability } from "@/server/services/agent";
import { visitAvailabilitySchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/**
 * GET /api/agente/visitas/disponibilidad?clientId=&desde=&dias= — franjas
 * libres para una visita del asesor (lunes a viernes, 9:00 a. m. – 4:00 p. m.
 * hora de Bogotá), sin chocar con su agenda.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAgent(request);
  const params = request.nextUrl.searchParams;
  const input = visitAvailabilitySchema.parse({
    clientId: params.get("clientId") ?? "",
    desde: params.get("desde") ?? undefined,
    dias: params.get("dias") ?? undefined,
  });

  return ok(await getVisitAvailability(input));
});
