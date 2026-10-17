import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import {
  getAdvisorSchedule,
  updateAdvisorSchedule,
} from "@/server/services/visit-schedules";
import { scheduleUpdateSchema } from "@/server/validators/visit-schedules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/agenda/asesores/:id — configuración, franjas y ausencias. */
export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;

  return ok(await getAdvisorSchedule(user, id));
});

/**
 * PUT /api/agenda/asesores/:id — reemplaza la configuración y la semana
 * completa de franjas. Un vendedor solo edita la suya (lo exige el servicio).
 */
export const PUT = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = scheduleUpdateSchema.parse(await readJson(request));

  return ok(await updateAdvisorSchedule(user, id, input));
});
