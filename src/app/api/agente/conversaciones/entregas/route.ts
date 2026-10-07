import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateDelivery } from "@/server/services/conversations";
import { deliverySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * POST /api/agente/conversaciones/entregas — estado de entrega desde el
 * webhook de Meta (sent, delivered, read, failed). Solo avanza; 404 si el
 * mensaje aún no está registrado.
 */
export const POST = route(async (request: NextRequest) => {
  await requireAgent(request);
  const input = deliverySchema.parse(await readJson(request));

  return ok(await updateDelivery(input));
});
