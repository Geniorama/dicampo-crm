import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { createVisit } from "@/server/services/visits";
import { visitCreateSchema } from "@/server/validators/visits";

export const runtime = "nodejs";

/** POST /api/visitas — registra una visita (cliente nuevo o fidelización). */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const input = visitCreateSchema.parse(await readJson(request));

  return created(await createVisit(user, input));
});
