import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { setConsent } from "@/server/services/conversations";
import { consentSchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * POST /api/agente/conversaciones/consentimiento — tipo AVISO, COMERCIAL o
 * BAJA, según la política de tratamiento de datos de Dicampo.
 */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = consentSchema.parse(await readJson(request));

  return ok(await setConsent(agent, input));
});
