import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getInventoryPanel } from "@/server/services/inventory-panel";
import { goalMonthQuerySchema } from "@/server/validators/goals";
import { currentMonth } from "@/lib/goals";

export const runtime = "nodejs";

/** GET /api/inventario/panel?mes=AAAA-MM — rentabilidad, rendimiento y días de stock. */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const { mes } = goalMonthQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));

  return ok(await getInventoryPanel(mes ?? currentMonth()));
});
