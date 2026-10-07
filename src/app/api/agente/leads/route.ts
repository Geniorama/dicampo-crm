import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createLead, findLeadByPhone } from "@/server/services/agent";
import { leadCreateSchema, leadLookupSchema } from "@/server/validators/agent";

export const runtime = "nodejs";

/**
 * GET /api/agente/leads?telefono= — ¿quién es este número? Devuelve la ficha
 * resumida del cliente o `null` si no está registrado.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAgent(request);
  const { telefono } = leadLookupSchema.parse({
    telefono: request.nextUrl.searchParams.get("telefono") ?? "",
  });

  return ok(await findLeadByPhone(telefono));
});

/**
 * POST /api/agente/leads — crea el lead (cliente PROSPECTO + contacto).
 * Idempotente por teléfono: 201 si lo creó, 200 si ya existía.
 */
export const POST = route(async (request: NextRequest) => {
  const agent = await requireAgent(request);
  const input = leadCreateSchema.parse(await readJson(request));

  const result = await createLead(agent, input);
  return result.created ? created(result.lead) : ok(result.lead);
});
