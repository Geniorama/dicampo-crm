import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { completeActivity } from "@/server/services/pipeline";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/actividades/:id/completar */
export const POST = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  return ok(await completeActivity(user, id));
});
