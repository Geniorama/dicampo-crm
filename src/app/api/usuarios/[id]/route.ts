import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getUser, updateUser } from "@/server/services/users";
import { userUpdateSchema } from "@/server/validators/users";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;

  return ok(await getUser(id));
});

/**
 * PATCH /api/usuarios/:id — nombre, rol, teléfono y activación.
 * Las salvaguardas contra quedarse sin administrador viven en el servicio.
 */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const input = userUpdateSchema.parse(await readJson(request));

  return ok(await updateUser(admin, id, input));
});
