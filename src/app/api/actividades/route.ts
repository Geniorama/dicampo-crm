import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createActivity, listActivities } from "@/server/services/pipeline";
import {
  activityCreateSchema,
  activityListQuerySchema,
} from "@/server/validators/pipeline";

export const runtime = "nodejs";

/** GET /api/actividades */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const query = activityListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listActivities(user, query));
});

/** POST /api/actividades — registra una interacción o una tarea pendiente. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = activityCreateSchema.parse(await readJson(request));

  return created(await createActivity(user, input));
});
