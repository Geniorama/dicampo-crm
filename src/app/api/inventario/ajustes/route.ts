import type { NextRequest } from "next/server";
import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { adjustStock } from "@/server/services/inventory";
import { stockAdjustmentSchema } from "@/server/validators/inventory";

export const runtime = "nodejs";

/** POST /api/inventario/ajustes — ajuste manual o merma sobre un lote. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(INVENTORY_ROLES);
  const input = stockAdjustmentSchema.parse(await readJson(request));

  return created(await adjustStock(user, input));
});
