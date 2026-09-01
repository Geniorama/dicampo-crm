import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getRoute, updateRoute } from "@/server/services/routes";
import { routeUpdateSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  return ok(await getRoute(id));
});

export const PATCH = route(async (request: NextRequest, context: Context) => {
  await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = routeUpdateSchema.parse(await readJson(request));

  return ok(await updateRoute(id, input));
});
