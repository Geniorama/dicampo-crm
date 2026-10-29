import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeOrderSeller } from "@/server/services/orders";
import { orderSellerSchema } from "@/server/validators/orders";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/pedidos/:id/vendedor — a qué asesor se atribuye la venta.
 * Solo ADMIN: mueve la venta entre las metas de dos personas.
 */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const input = orderSellerSchema.parse(await readJson(request));

  return ok(await changeOrderSeller(admin, id, input));
});
