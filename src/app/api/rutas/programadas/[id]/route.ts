import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateSchedule } from "@/server/services/route-schedules";
import { todayInBogota } from "@/server/services/routes";
import { routeScheduleUpdateSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/rutas/programadas/:id — pausar, reanudar o cambiar lo que heredan las próximas rutas. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = routeScheduleUpdateSchema.parse(await readJson(request));

  return ok(await updateSchedule(id, input, todayInBogota()));
});
