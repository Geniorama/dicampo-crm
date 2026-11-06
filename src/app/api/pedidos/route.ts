import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/guards";
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

/** POST /api/pedidos — un administrador crea un pedido directo (sin cotización), en borrador. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireAdmin();
  const input = orderCreateSchema.parse(await readJson(request));

  return created(await createOrder(user, input));
});
