import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateZone } from "@/server/services/zones";
import { zoneUpdateSchema } from "@/server/validators/zones";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/zonas/:id — nombre, descripción y activación. No se borran. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  const input = zoneUpdateSchema.parse(await readJson(request));

  return ok(await updateZone(id, input));
});
