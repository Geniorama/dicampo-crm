import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { registerFailedDelivery } from "@/server/services/routes";
import { deliveryFailureSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/pedidos/:id/no-entrega — la visita no pudo completarse. Guarda el
 * motivo y devuelve el pedido a preparación para reprogramarlo.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = deliveryFailureSchema.parse(await readJson(request));

  return ok(await registerFailedDelivery(user, id, input));
});
