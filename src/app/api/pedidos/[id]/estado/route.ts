import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeOrderStatus } from "@/server/services/orders";
import { orderStatusChangeSchema } from "@/server/validators/orders";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/pedidos/:id/estado — avanza el pedido en su ciclo de vida.
 * Confirmar descuenta inventario por FEFO; cancelar lo devuelve.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const input = orderStatusChangeSchema.parse(await readJson(request));

  return ok(await changeOrderStatus(user, id, input));
});
