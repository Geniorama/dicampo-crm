import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateCollection } from "@/server/services/receivables";
import { collectionUpdateSchema } from "@/server/validators/payments";

export const runtime = "nodejs";

type Context = { params: Promise<{ clientId: string }> };

/** PATCH /api/cartera/:clientId — estado y observaciones de cobro del cliente. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { clientId } = await context.params;
  const input = collectionUpdateSchema.parse(await readJson(request));

  return ok(await updateCollection(user, clientId, input));
});
