import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { recordMessage } from "@/server/services/conversations";
import { messageSchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * POST /api/agente/conversaciones/mensajes — registra un mensaje entrante o
 * saliente. Idempotente por `waMessageId`: 201 si es nuevo, 200 si ya estaba.
 * Devuelve `palabraClave` (BAJA / ELIMINAR_DATOS) para que el flujo confirme.
 */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = messageSchema.parse(await readJson(request));

  const result = await recordMessage(agent, input);
  return result.creado ? created(result) : ok(result);
});
