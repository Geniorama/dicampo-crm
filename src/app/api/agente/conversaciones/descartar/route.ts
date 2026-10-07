import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { disqualify } from "@/server/services/conversations";
import { disqualifySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * POST /api/agente/conversaciones/descartar — fuera de cobertura o sin
 * negocio. Cierra la conversación con el motivo y no crea cliente.
 */
export const POST = route(async (request: NextRequest) => {
  await requireAgent(request);
  const input = disqualifySchema.parse(await readJson(request));

  return ok(await disqualify(input));
});
