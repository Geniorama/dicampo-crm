import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeQuoteStatus } from "@/server/services/quotes";
import { quoteStatusChangeSchema } from "@/server/validators/quotes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/:id/estado — enviar, rechazar o reenviar. */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = quoteStatusChangeSchema.parse(await readJson(request));

  return ok(await changeQuoteStatus(user, id, input));
});
