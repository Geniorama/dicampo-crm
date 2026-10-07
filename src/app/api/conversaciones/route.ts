import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { listConversations } from "@/server/services/supervision";
import { conversationListQuerySchema } from "@/server/validators/conversations";
import { flattenSearchParams } from "@/lib/search-params";

export const runtime = "nodejs";

/** GET /api/conversaciones — bandeja; un VENDEDOR solo ve las suyas. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const query = conversationListQuerySchema.parse(
    flattenSearchParams(Object.fromEntries(request.nextUrl.searchParams)),
  );
  return ok(await listConversations(user, query));
});
