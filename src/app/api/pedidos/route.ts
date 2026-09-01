import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createOrder, listOrders } from "@/server/services/orders";
import {
  orderCreateSchema,
  orderListQuerySchema,
} from "@/server/validators/orders";

export const runtime = "nodejs";

/** GET /api/pedidos — listado paginado con filtros. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const query = orderListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listOrders(user, query));
});

/** POST /api/pedidos — crea un pedido en borrador. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const input = orderCreateSchema.parse(await readJson(request));

  return created(await createOrder(user, input));
});
