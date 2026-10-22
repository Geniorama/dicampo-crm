import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createQuote, listQuotes } from "@/server/services/quotes";
import {
  quoteCreateSchema,
  quoteListQuerySchema,
} from "@/server/validators/quotes";

export const runtime = "nodejs";

/** GET /api/cotizaciones — listado paginado con filtros. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const query = quoteListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listQuotes(user, query));
});

/** POST /api/cotizaciones — crea una cotización en borrador. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const input = quoteCreateSchema.parse(await readJson(request));

  return created(await createQuote(user, input));
});
