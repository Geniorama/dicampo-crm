import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getDispatchDay } from "@/server/services/routes";
import { dispatchDayQuerySchema } from "@/server/validators/routes";

export const runtime = "nodejs";

/** GET /api/rutas/dia?fecha=AAAA-MM-DD — pedidos por entregar ese día (hoy por defecto). */
export const GET = route(async (request: NextRequest) => {
  await requireUser(DISPATCH_ROLES);
  const { fecha } = dispatchDayQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await getDispatchDay(fecha));
});
