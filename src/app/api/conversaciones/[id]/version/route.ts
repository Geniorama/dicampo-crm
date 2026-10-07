import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getConversationVersion } from "@/server/services/supervision";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/conversaciones/:id/version — huella para refrescar el chat solo
 * cuando cambió algo.
 */
export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  return ok(await getConversationVersion(user, id));
});
