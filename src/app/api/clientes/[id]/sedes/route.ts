import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { addAddress } from "@/server/services/clients";
import { addressCreateSchema } from "@/server/validators/clients";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/clientes/:id/sedes */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const input = addressCreateSchema.parse(await readJson(request));

  return created(await addAddress(user, id, input));
});
