import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { expireOverdueLots } from "@/server/services/inventory";

export const runtime = "nodejs";

/**
 * POST /api/inventario/vencidos — marca como VENCIDOS los lotes cuya fecha ya
 * pasó, sacándolos de la rotación FEFO. Pensado para una tarea diaria; por
 * ahora se dispara desde la interfaz de bodega.
 */
export const POST = route(async () => {
  await requireUser(INVENTORY_ROLES);
  return ok(await expireOverdueLots());
});
