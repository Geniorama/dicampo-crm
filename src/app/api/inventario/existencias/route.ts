import { requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getStockSummary } from "@/server/services/inventory";

export const runtime = "nodejs";

/** GET /api/inventario/existencias — saldo consolidado por variante. */
export const GET = route(async () => {
  await requireUser();
  return ok(await getStockSummary());
});
