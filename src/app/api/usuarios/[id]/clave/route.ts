import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { resetPassword } from "@/server/services/users";
import { passwordResetSchema } from "@/server/validators/users";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/usuarios/:id/clave — un ADMIN restablece la clave de otro. */
export const POST = route(async (request: NextRequest, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const input = passwordResetSchema.parse(await readJson(request));

  return ok(await resetPassword(admin, id, input));
});
