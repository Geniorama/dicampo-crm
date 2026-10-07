import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getConversation } from "@/server/services/supervision";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/conversaciones/:id — chat con URLs firmadas de la multimedia. */
export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  return ok(await getConversation(user, id));
});
