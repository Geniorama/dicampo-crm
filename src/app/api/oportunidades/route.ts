import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import {
  createOpportunity,
  listOpportunities,
} from "@/server/services/pipeline";
import {
  opportunityCreateSchema,
  opportunityListQuerySchema,
} from "@/server/validators/pipeline";

export const runtime = "nodejs";

/** GET /api/oportunidades — agrupadas por etapa para el tablero. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const query = opportunityListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listOpportunities(user, query));
});

/** POST /api/oportunidades */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const input = opportunityCreateSchema.parse(await readJson(request));

  return created(await createOpportunity(user, input));
});
