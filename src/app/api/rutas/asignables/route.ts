import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { listAssignableOrders } from "@/server/services/routes";

export const runtime = "nodejs";

/** GET /api/rutas/asignables — pedidos listos para montar en una ruta. */
export const GET = route(async (request: NextRequest) => {
  await requireUser();
  const zoneId = request.nextUrl.searchParams.get("zoneId");

  return ok(await listAssignableOrders(zoneId));
});
