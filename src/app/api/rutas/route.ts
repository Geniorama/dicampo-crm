import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createRoute, listRoutes } from "@/server/services/routes";
import { routeCreateSchema, routeListQuerySchema } from "@/server/validators/routes";

export const runtime = "nodejs";

/** GET /api/rutas */
export const GET = route(async (request: NextRequest) => {
  await requireUser();
  const query = routeListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listRoutes(query));
});

/** POST /api/rutas */
export const POST = route(async (request: NextRequest) => {
  await requireUser(DISPATCH_ROLES);
  const input = routeCreateSchema.parse(await readJson(request));

  return created(await createRoute(input));
});
