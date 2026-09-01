import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createClient, listClients } from "@/server/services/clients";
import {
  clientCreateSchema,
  clientListQuerySchema,
} from "@/server/validators/clients";

export const runtime = "nodejs";

/** GET /api/clientes — listado paginado con filtros. */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser();
  const query = clientListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listClients(user, query));
});

/** POST /api/clientes — crea un cliente. */
export const POST = route(async (request: NextRequest) => {
  const user = await requireUser();
  const input = clientCreateSchema.parse(await readJson(request));

  return created(await createClient(user, input));
});
