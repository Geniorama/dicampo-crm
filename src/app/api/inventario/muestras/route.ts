import type { NextRequest } from "next/server";
import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { registerSample } from "@/server/services/inventory";
import { sampleSchema } from "@/server/validators/inventory";

export const runtime = "nodejs";

/** POST /api/inventario/muestras — pulpa entregada gratis; sale por FEFO. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(INVENTORY_ROLES);
  const input = sampleSchema.parse(await readJson(request));

  return created(await registerSample(user, input));
});
