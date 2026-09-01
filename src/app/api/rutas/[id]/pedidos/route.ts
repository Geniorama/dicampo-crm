import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { setRouteOrders } from "@/server/services/routes";
import { routeOrdersSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * PUT /api/rutas/:id/pedidos — fija los pedidos de la ruta y su orden de
 * visita. Reemplaza la asignación completa, no añade de a uno.
 */
export const PUT = route(async (request: NextRequest, context: Context) => {
  await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = routeOrdersSchema.parse(await readJson(request));

  return ok(await setRouteOrders(id, input));
});
