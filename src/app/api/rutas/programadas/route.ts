import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { listSchedules } from "@/server/services/route-schedules";

export const runtime = "nodejs";

/** GET /api/rutas/programadas — rutas recurrentes. Se crean con `repeatWeekly` en POST /api/rutas. */
export const GET = route(async () => {
  await requireUser(DISPATCH_ROLES);
  return ok(await listSchedules());
});
