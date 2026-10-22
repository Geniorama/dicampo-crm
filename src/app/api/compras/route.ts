import type { NextRequest } from "next/server";
import { PURCHASING_ROLES, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createPurchase, listPurchases } from "@/server/services/purchases";
import { goalMonthQuerySchema } from "@/server/validators/goals";
import { purchaseCreateSchema } from "@/server/validators/purchases";
import { currentMonth } from "@/lib/goals";

export const runtime = "nodejs";

/** GET /api/compras?mes=AAAA-MM — compras de fruta del mes (el actual por defecto). */
export const GET = route(async (request: NextRequest) => {
  await requireUser(PURCHASING_ROLES);
  const { mes } = goalMonthQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  return ok(await listPurchases(mes ?? currentMonth()));
});

/** POST /api/compras — registra una compra de fruta. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(PURCHASING_ROLES);
  const input = purchaseCreateSchema.parse(await readJson(request));

  return created(await createPurchase(user, input));
});
