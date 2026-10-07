import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { releaseConversation } from "@/server/services/supervision";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/conversaciones/:id/liberar — devuelve la conversación al agente IA. */
export const POST = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  return ok(await releaseConversation(user, id));
});
