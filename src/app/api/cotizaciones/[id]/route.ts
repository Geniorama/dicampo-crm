import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getQuote } from "@/server/services/quotes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;

  return ok(await getQuote(user, id));
});
