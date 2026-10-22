import type { NextRequest } from "next/server";
import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { listBatches, registerBatch } from "@/server/services/production";
import { batchCreateSchema } from "@/server/validators/production";

export const runtime = "nodejs";

/** GET /api/produccion — tandas recientes. */
export const GET = route(async () => {
  await requireUser(INVENTORY_ROLES);

  return ok(await listBatches());
});

/** POST /api/produccion — registra una tanda; la pulpa pública entra como lote. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(INVENTORY_ROLES);
  const input = batchCreateSchema.parse(await readJson(request));

  return created(await registerBatch(user, input));
});
