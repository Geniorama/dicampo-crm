import type { NextRequest } from "next/server";
import { requireAdmin, requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getGoalsProgress, upsertGoal } from "@/server/services/goals";
import { goalMonthQuerySchema, goalUpsertSchema } from "@/server/validators/goals";
import { currentMonth } from "@/lib/goals";

export const runtime = "nodejs";

/** GET /api/metas?mes=AAAA-MM — cumplimiento del mes (el actual por defecto). */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const { mes } = goalMonthQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  return ok(await getGoalsProgress(user, mes ?? currentMonth()));
});

/** PUT /api/metas — fija la meta de un mes y asesor (o la general). Solo ADMIN. */
export const PUT = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = goalUpsertSchema.parse(await readJson(request));

  return ok(await upsertGoal(input));
});
