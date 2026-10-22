import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getQuote, updateQuote } from "@/server/services/quotes";
import { quoteUpdateSchema } from "@/server/validators/quotes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;

  return ok(await getQuote(user, id));
});

/** PATCH /api/cotizaciones/:id — solo mientras la cotización esté en BORRADOR. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = quoteUpdateSchema.parse(await readJson(request));

  return ok(await updateQuote(user, id, input));
});
