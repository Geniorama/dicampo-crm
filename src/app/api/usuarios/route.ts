import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createUser, listUsers } from "@/server/services/users";
import {
  userCreateSchema,
  userListQuerySchema,
} from "@/server/validators/users";

export const runtime = "nodejs";

/** GET /api/usuarios — solo administración. */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const query = userListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listUsers(query));
});

/** POST /api/usuarios — crea una cuenta interna. */
export const POST = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = userCreateSchema.parse(await readJson(request));

  return created(await createUser(input));
});
