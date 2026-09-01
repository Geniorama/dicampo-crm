import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getClient, updateClient } from "@/server/services/clients";
import { clientUpdateSchema } from "@/server/validators/clients";

export const runtime = "nodejs";

// En Next.js 15 los parámetros de ruta llegan como promesa.
type Context = { params: Promise<{ id: string }> };

/** GET /api/clientes/:id */
export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  return ok(await getClient(user, id));
});

/** PATCH /api/clientes/:id — actualización parcial. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const input = clientUpdateSchema.parse(await readJson(request));

  return ok(await updateClient(user, id, input));
});
