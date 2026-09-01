import bcrypt from "bcryptjs";
import { prisma } from "../db";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors";
import { UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import type {
  PasswordChangeInput,
  PasswordResetInput,
  UserCreateInput,
  UserListQuery,
  UserUpdateInput,
} from "../validators/users";

/**
 * Gestión de usuarios internos.
 *
 * Tres salvaguardas gobiernan este módulo, todas contra el mismo riesgo:
 * quedarse fuera del sistema sin poder volver a entrar.
 *
 *  1. Nadie puede desactivarse a sí mismo.
 *  2. Nadie puede quitarse a sí mismo el rol de ADMIN.
 *  3. Siempre debe quedar al menos un ADMIN activo.
 *
 * Además, los usuarios **no se borran**: se desactivan. Sus pedidos, clientes
 * y movimientos de inventario tienen que seguir teniendo autor.
 */

/** Coste de bcrypt. 10 rondas es el equilibrio habitual en 2026. */
const BCRYPT_ROUNDS = 10;

/** Nunca se expone `passwordHash` fuera de este módulo. */
const publicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
  _count: {
    select: { ownedClients: true, soldOrders: true, opportunities: true },
  },
} as const;

export async function listUsers(query: UserListQuery) {
  const { search, role, includeInactive } = query;

  return prisma.user.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: publicSelect,
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: publicSelect,
  });
  if (!user) throw new NotFoundError("El usuario");
  return user;
}

export async function createUser(input: UserCreateInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, active: true },
  });

  if (existing) {
    throw new ConflictError(
      existing.active
        ? "Ya existe un usuario con ese correo."
        : "Ya existe un usuario desactivado con ese correo. Reactívalo en vez de crear otro.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash,
    },
    select: publicSelect,
  });
}

/** Cuenta los ADMIN activos, excluyendo opcionalmente a uno. */
async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      active: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

export async function updateUser(
  actor: SessionUser,
  id: string,
  input: UserUpdateInput,
) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, active: true, name: true },
  });
  if (!target) throw new NotFoundError("El usuario");

  const isSelf = actor.id === id;

  // Salvaguarda 1: no puedes desactivarte a ti mismo.
  if (isSelf && input.active === false) {
    throw new BusinessRuleError(
      "No puedes desactivar tu propia cuenta. Pídeselo a otro administrador.",
    );
  }

  // Salvaguarda 2: no puedes quitarte a ti mismo el rol de ADMIN.
  if (isSelf && input.role !== undefined && input.role !== UserRole.ADMIN) {
    throw new BusinessRuleError(
      "No puedes quitarte a ti mismo el rol de administrador.",
    );
  }

  // Salvaguarda 3: siempre debe quedar un ADMIN activo.
  const losesAdmin =
    target.role === UserRole.ADMIN &&
    ((input.role !== undefined && input.role !== UserRole.ADMIN) ||
      input.active === false);

  if (losesAdmin && (await countActiveAdmins(id)) === 0) {
    throw new BusinessRuleError(
      `${target.name} es el único administrador activo. Nombra otro antes de cambiarlo.`,
    );
  }

  return prisma.user.update({
    where: { id },
    data: input,
    select: publicSelect,
  });
}

/** Un ADMIN restablece la contraseña de otra persona. */
export async function resetPassword(
  actor: SessionUser,
  id: string,
  input: PasswordResetInput,
) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) throw new NotFoundError("El usuario");

  // Cambiar la propia contraseña exige conocer la anterior; para eso está
  // `changeOwnPassword`. Este endpoint es solo para restablecer la de otros.
  if (actor.id === id) {
    throw new ForbiddenError(
      "Para cambiar tu propia contraseña usa la opción de tu perfil.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  return { ok: true };
}

/** Cualquiera cambia su propia contraseña, probando que conoce la actual. */
export async function changeOwnPassword(
  actor: SessionUser,
  input: PasswordChangeInput,
) {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) throw new NotFoundError("El usuario");

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new ValidationError("La contraseña actual no es correcta.", [
      { path: ["currentPassword"], message: "No coincide" },
    ]);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { ok: true };
}
