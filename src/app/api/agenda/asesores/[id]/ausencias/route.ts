import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { createBlock } from "@/server/services/visit-schedules";
import { blockCreateSchema } from "@/server/validators/visit-schedules";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/agenda/asesores/:id/ausencias — vacaciones, citas, permisos. */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = blockCreateSchema.parse(await readJson(request));

  return created(await createBlock(user, id, input));
});
