import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getOpportunity, updateOpportunity } from "@/server/services/pipeline";
import { opportunityUpdateSchema } from "@/server/validators/pipeline";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  return ok(await getOpportunity(user, id));
});

export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = opportunityUpdateSchema.parse(await readJson(request));

  return ok(await updateOpportunity(user, id, input));
});
