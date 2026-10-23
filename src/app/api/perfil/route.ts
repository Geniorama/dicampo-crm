import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateOwnProfile } from "@/server/services/users";
import { ownProfileSchema } from "@/server/validators/users";

export const runtime = "nodejs";

/** PATCH /api/perfil — cualquiera cambia su propio nombre y teléfono. */
export const PATCH = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = ownProfileSchema.parse(await readJson(request));

  return ok(await updateOwnProfile(user, input));
});
