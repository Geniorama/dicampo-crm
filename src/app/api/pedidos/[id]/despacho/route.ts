import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser, SALES_ROLES } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateDispatchNotes } from "@/server/services/routes";
import { dispatchNotesSchema } from "@/server/validators/routes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/pedidos/:id/despacho — qué cobrar y qué obsequio lleva el pedido. */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser([...DISPATCH_ROLES, ...SALES_ROLES]);
  const { id } = await context.params;
  const input = dispatchNotesSchema.parse(await readJson(request));

  return ok(await updateDispatchNotes(user, id, input));
});
