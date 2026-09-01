import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { noContent, ok, readJson, route } from "@/server/http";
import { deactivateAddress, updateAddress } from "@/server/services/clients";
import { addressUpdateSchema } from "@/server/validators/clients";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; addressId: string }> };

/** PATCH /api/clientes/:id/sedes/:addressId */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { addressId } = await context.params;
  const input = addressUpdateSchema.parse(await readJson(request));

  return ok(await updateAddress(user, addressId, input));
});

/** DELETE /api/clientes/:id/sedes/:addressId — da de baja, no borra. */
export const DELETE = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { addressId } = await context.params;
  await deactivateAddress(user, addressId);

  return noContent();
});
