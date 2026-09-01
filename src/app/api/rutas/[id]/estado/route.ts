import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeRouteStatus } from "@/server/services/routes";
import { routeStatusSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/rutas/:id/estado — salir a ruta despacha sus pedidos; cancelarla
 * los devuelve a preparación para reprogramarlos.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = routeStatusSchema.parse(await readJson(request));

  return ok(await changeRouteStatus(user, id, input));
});
