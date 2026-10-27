import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { markArrival } from "@/server/services/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/pedidos/:id/llegada — el repartidor marca que llegó a la parada. */
export const POST = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;

  return ok(await markArrival(user, id));
});
