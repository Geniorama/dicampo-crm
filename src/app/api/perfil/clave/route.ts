import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { changeOwnPassword } from "@/server/services/users";
import { passwordChangeSchema } from "@/server/validators/users";

export const runtime = "nodejs";

/** POST /api/perfil/clave — cualquiera cambia su propia contraseña. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = passwordChangeSchema.parse(await readJson(request));

  return ok(await changeOwnPassword(user, input));
});
