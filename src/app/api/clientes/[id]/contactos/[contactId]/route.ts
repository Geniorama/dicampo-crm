import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { noContent, ok, readJson, route } from "@/server/http";
import { deactivateContact, updateContact } from "@/server/services/clients";
import { contactUpdateSchema } from "@/server/validators/clients";

export const runtime = "nodejs";

// El id del cliente va en la ruta por jerarquía; el servicio verifica que el
// contacto pertenezca a un cliente accesible, así que no hace falta leerlo.
type Context = { params: Promise<{ id: string; contactId: string }> };

/** PATCH /api/clientes/:id/contactos/:contactId */
export const PATCH = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { contactId } = await context.params;
  const input = contactUpdateSchema.parse(await readJson(request));

  return ok(await updateContact(user, contactId, input));
});

/** DELETE /api/clientes/:id/contactos/:contactId — da de baja, no borra. */
export const DELETE = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { contactId } = await context.params;
  await deactivateContact(user, contactId);

  return noContent();
});
