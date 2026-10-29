import { requireAdmin } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createZone, listZones } from "@/server/services/zones";
import { zoneCreateSchema } from "@/server/validators/zones";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/** GET /api/zonas — zonas de entrega con su uso. Solo administración. */
export const GET = route(async () => {
  await requireAdmin();
  return ok(await listZones());
});

/** POST /api/zonas — crea una zona de entrega. */
export const POST = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = zoneCreateSchema.parse(await readJson(request));

  return created(await createZone(input));
});
