import type { NextRequest } from "next/server";
import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { listLots, registerLot } from "@/server/services/inventory";
import {
  lotCreateSchema,
  lotListQuerySchema,
} from "@/server/validators/inventory";

export const runtime = "nodejs";

/** GET /api/inventario/lotes */
export const GET = route(async (request: NextRequest) => {
  await requireUser();
  const query = lotListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listLots(query));
});

/** POST /api/inventario/lotes — registra una entrada de producción. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(INVENTORY_ROLES);
  const input = lotCreateSchema.parse(await readJson(request));

  return created(await registerLot(user, input));
});
