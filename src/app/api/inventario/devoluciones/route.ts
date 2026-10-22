import type { NextRequest } from "next/server";
import { INVENTORY_ROLES, requireUser } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { registerReturn } from "@/server/services/inventory";
import { returnSchema } from "@/server/validators/inventory";

export const runtime = "nodejs";

/** POST /api/inventario/devoluciones — vendible reingresa al lote; dañada solo se registra. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser(INVENTORY_ROLES);
  const input = returnSchema.parse(await readJson(request));

  return created(await registerReturn(user, input));
});
