import { redirect } from "next/navigation";
import { auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { UserRole } from "@/generated/prisma/enums";

/**
 * Autorización de la aplicación.
 *
 * El MVP no usa RLS de Supabase: Prisma conecta con un rol privilegiado y los
 * permisos se aplican aquí. Por eso **todo** route handler y toda página del
 * área privada debe empezar llamando a `requireUser`.
 */

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

/** Devuelve el usuario de la sesión, o `null` si no hay sesión. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/**
 * Exige sesión iniciada y, opcionalmente, uno de los roles indicados.
 * ADMIN siempre pasa: es el rol con acceso total.
 */
export async function requireUser(
  allowedRoles?: readonly UserRole[],
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();

  if (allowedRoles && allowedRoles.length > 0) {
    const permitted =
      user.role === UserRole.ADMIN || allowedRoles.includes(user.role);
    if (!permitted) throw new ForbiddenError();
  }

  return user;
}

/**
 * Las rutas `/api/agente/*` no usan sesión: exigen la API key de n8n.
 * Ver `agent-auth.ts`.
 */
export { requireAgent } from "./agent-auth";

export function isAdmin(user: SessionUser): boolean {
  return user.role === UserRole.ADMIN;
}

/**
 * Variante de `requireUser` para **páginas**.
 *
 * En un route handler, lanzar `ForbiddenError` produce un 403 con cuerpo JSON,
 * que es lo correcto. En un Server Component, en cambio, la excepción llega al
 * límite de error y la respuesta sale con estado 500: un rechazo de permisos
 * acabaría contabilizado como un fallo del servidor. Aquí se redirige, que
 * además es mejor experiencia — la persona vuelve a donde sí puede estar.
 */
export async function requireUserPage(
  allowedRoles?: readonly UserRole[],
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (allowedRoles && allowedRoles.length > 0) {
    const permitted =
      user.role === UserRole.ADMIN || allowedRoles.includes(user.role);
    if (!permitted) redirect("/dashboard");
  }

  return user;
}

/** Igual que `requireUserPage`, pero exigiendo rol ADMIN. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== UserRole.ADMIN) redirect("/dashboard");

  return user;
}

/**
 * Exige rol ADMIN. Existe como función propia porque `requireUser([])` NO
 * restringe: una lista de roles vacía significa "cualquier usuario con sesión".
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (user.role !== UserRole.ADMIN) throw new ForbiddenError();

  return user;
}

/**
 * Un VENDEDOR solo ve la cartera que tiene asignada; los demás roles ven todo.
 * Devuelve el filtro de Prisma correspondiente, para componerlo en las
 * consultas de clientes, oportunidades y pedidos.
 */
export function scopeToOwnPortfolio(
  user: SessionUser,
): { ownerId: string } | Record<string, never> {
  return user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {};
}

/** Roles que pueden operar inventario. */
export const INVENTORY_ROLES = [UserRole.BODEGA] as const;

/** Roles que pueden planear y ejecutar despachos. */
export const DISPATCH_ROLES = [UserRole.DESPACHO, UserRole.BODEGA] as const;

/** Roles que pueden gestionar clientes y pedidos. */
export const SALES_ROLES = [UserRole.VENDEDOR] as const;
