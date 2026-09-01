import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getOrder, updateOrder } from "@/server/services/orders";
import { orderUpdateSchema } from "@/server/validators/orders";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  return ok(await getOrder(user, id));
});

/** PATCH /api/pedidos/:id — solo mientras el pedido esté en BORRADOR. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = orderUpdateSchema.parse(await readJson(request));

  return ok(await updateOrder(user, id, input));
});
