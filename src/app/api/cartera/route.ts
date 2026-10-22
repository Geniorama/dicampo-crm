import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { listReceivables } from "@/server/services/receivables";
import { receivablesQuerySchema } from "@/server/validators/payments";

export const runtime = "nodejs";

/** GET /api/cartera — clientes con saldo de pedidos entregados, del más vencido al menos. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const query = receivablesQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  return ok(await listReceivables(user, query));
});
