import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { registerDelivery } from "@/server/services/routes";
import { deliveryProofSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/pedidos/:id/entrega — registra la evidencia y marca ENTREGADO.
 * Si era la última entrega pendiente, cierra la ruta.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(DISPATCH_ROLES);
  const { id } = await context.params;
  const input = deliveryProofSchema.parse(await readJson(request));

  return created(await registerDelivery(user, id, input));
});
