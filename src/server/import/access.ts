import { notFound } from "next/navigation";
import {
  isImportEntityKey,
  type ImportEntityKey,
} from "@/lib/import/entities";
import { NotFoundError } from "../errors";
import {
  requireAdmin,
  requireAdminPage,
  requireUser,
  requireUserPage,
  type SessionUser,
} from "../guards";
import { importAccess } from "./registry";

/**
 * Autorización de la carga masiva.
 *
 * Cada entidad se protege con los mismos roles que su módulo: quien no puede
 * crear un producto a mano tampoco puede subir cien por archivo. Hay dos
 * variantes porque el rechazo se expresa distinto según dónde ocurra — en la
 * API, un 401/403 con cuerpo JSON; en una página, una redirección.
 */

function parseKey(value: string): ImportEntityKey {
  if (!isImportEntityKey(value)) {
    throw new NotFoundError("Esa carga masiva");
  }
  return value;
}

/** Variante para route handlers: lanza y `route()` la traduce a 401/403. */
export async function authorizeImport(
  entidad: string,
): Promise<{ key: ImportEntityKey; user: SessionUser }> {
  const key = parseKey(entidad);
  const access = importAccess(key);

  const user = access === "admin" ? await requireAdmin() : await requireUser(access);

  return { key, user };
}

/** Variante para páginas: redirige en vez de responder con estado 500. */
export async function authorizeImportPage(
  entidad: string,
): Promise<{ key: ImportEntityKey; user: SessionUser }> {
  if (!isImportEntityKey(entidad)) notFound();

  const access = importAccess(entidad);
  const user =
    access === "admin" ? await requireAdminPage() : await requireUserPage(access);

  return { key: entidad, user };
}
