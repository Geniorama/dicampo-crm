import { prisma } from "../db";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors";
import { scopeToOwnPortfolio, type SessionUser } from "../guards";
import { UserRole } from "@/generated/prisma/enums";
import { calculateNitDv } from "@/lib/nit";
import type {
  AddressCreateInput,
  ClientCreateInput,
  ClientListQuery,
  ClientUpdateInput,
  ContactCreateInput,
  ContactUpdateInput,
  AddressUpdateInput,
} from "../validators/clients";

/**
 * Lógica de negocio de clientes.
 *
 * Reglas que se aplican aquí, no en la UI ni en las rutas:
 * - Un VENDEDOR solo ve y edita la cartera que tiene asignada.
 * - Solo un ADMIN puede reasignar el vendedor responsable de un cliente.
 * - El NIT es único; si falta el DV, se calcula.
 * - Solo puede haber un contacto y una sede marcados como principales.
 */

/** Campos que se listan en la tabla de clientes. */
const listSelect = {
  id: true,
  sequence: true,
  businessName: true,
  tradeName: true,
  nit: true,
  nitDv: true,
  type: true,
  status: true,
  phone: true,
  email: true,
  createdAt: true,
  owner: { select: { id: true, name: true } },
  _count: { select: { orders: true } },
} as const;

export async function listClients(user: SessionUser, query: ClientListQuery) {
  const { search, status, type, ownerId, page, pageSize } = query;

  const where = {
    ...scopeToOwnPortfolio(user),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    // El filtro explícito por vendedor solo tiene sentido para quien ve todo;
    // a un VENDEDOR el scope ya lo limita a su propia cartera.
    ...(ownerId && user.role !== UserRole.VENDEDOR ? { ownerId } : {}),
    ...(search
      ? {
          OR: [
            { businessName: { contains: search, mode: "insensitive" as const } },
            { tradeName: { contains: search, mode: "insensitive" as const } },
            { nit: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: listSelect,
      orderBy: { businessName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Ficha completa del cliente, con contactos, sedes y actividad reciente. */
export async function getClient(user: SessionUser, id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      priceList: { select: { id: true, name: true } },
      contacts: {
        where: { active: true },
        orderBy: [{ isPrimary: "desc" }, { firstName: "asc" }],
      },
      addresses: {
        where: { active: true },
        orderBy: [{ isPrimary: "desc" }, { label: "asc" }],
        include: { zone: { select: { id: true, name: true } } },
      },
      orders: {
        orderBy: { orderDate: "desc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          orderDate: true,
        },
      },
      opportunities: {
        orderBy: [{ closedAt: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          stage: true,
          estimatedValue: true,
          expectedCloseDate: true,
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!client) throw new NotFoundError("El cliente");
  assertCanAccess(user, client.ownerId);

  return client;
}

/** Un VENDEDOR solo puede tocar clientes de su cartera. */
function assertCanAccess(user: SessionUser, ownerId: string | null) {
  if (user.role === UserRole.VENDEDOR && ownerId !== user.id) {
    throw new ForbiddenError("Este cliente no está en tu cartera.");
  }
}

async function assertNitIsFree(nit: string, excludeClientId?: string) {
  const existing = await prisma.client.findUnique({
    where: { nit },
    select: { id: true, businessName: true },
  });

  if (existing && existing.id !== excludeClientId) {
    throw new ConflictError(
      `El NIT ya está registrado para "${existing.businessName}".`,
    );
  }
}

export async function createClient(user: SessionUser, input: ClientCreateInput) {
  if (input.nit) await assertNitIsFree(input.nit);

  // Un vendedor siempre queda como responsable de lo que crea; un ADMIN
  // puede asignar la cartera a otro usuario.
  const ownerId =
    user.role === UserRole.VENDEDOR ? user.id : (input.ownerId ?? user.id);

  // La lista de precios por defecto aplica si no se indica otra.
  const priceListId =
    input.priceListId ??
    (
      await prisma.priceList.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      })
    )?.id;

  return prisma.client.create({
    data: {
      ...input,
      ownerId,
      priceListId,
      // Si dieron el NIT sin DV, se calcula en vez de dejarlo vacío.
      nitDv: input.nit ? (input.nitDv ?? calculateNitDv(input.nit)) : undefined,
    },
  });
}

export async function updateClient(
  user: SessionUser,
  id: string,
  input: ClientUpdateInput,
) {
  const current = await prisma.client.findUnique({
    where: { id },
    select: { id: true, ownerId: true, nit: true },
  });

  if (!current) throw new NotFoundError("El cliente");
  assertCanAccess(user, current.ownerId);

  if (input.nit && input.nit !== current.nit) {
    await assertNitIsFree(input.nit, id);
  }

  // Reasignar la cartera es decisión de administración.
  const { ownerId, ...rest } = input;
  if (ownerId !== undefined && user.role !== UserRole.ADMIN) {
    throw new ForbiddenError("Solo un administrador puede reasignar clientes.");
  }

  const nit = input.nit ?? current.nit;

  return prisma.client.update({
    where: { id },
    data: {
      ...rest,
      ...(ownerId !== undefined ? { ownerId } : {}),
      ...(nit ? { nitDv: input.nitDv ?? calculateNitDv(nit) } : {}),
    },
  });
}

// ── Contactos ────────────────────────────────────────────────

export async function addContact(
  user: SessionUser,
  clientId: string,
  input: ContactCreateInput,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { ownerId: true },
  });
  if (!client) throw new NotFoundError("El cliente");
  assertCanAccess(user, client.ownerId);

  return prisma.$transaction(async (tx) => {
    // "Principal" es excluyente: marcar uno desmarca al anterior.
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.contact.create({ data: { ...input, clientId } });
  });
}

/** Comprueba que el contacto pertenece a un cliente al que se puede acceder. */
async function assertOwnsContact(user: SessionUser, contactId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, clientId: true, client: { select: { ownerId: true } } },
  });
  if (!contact) throw new NotFoundError("El contacto");
  assertCanAccess(user, contact.client.ownerId);

  return contact;
}

export async function updateContact(
  user: SessionUser,
  contactId: string,
  input: ContactUpdateInput,
) {
  const contact = await assertOwnsContact(user, contactId);

  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { clientId: contact.clientId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }

    return tx.contact.update({ where: { id: contactId }, data: input });
  });
}

/**
 * Da de baja un contacto. No se borra: las actividades registradas lo
 * referencian y perderlo dejaría la bitácora sin interlocutor.
 */
export async function deactivateContact(user: SessionUser, contactId: string) {
  const contact = await assertOwnsContact(user, contactId);

  return prisma.$transaction(async (tx) => {
    const deactivated = await tx.contact.update({
      where: { id: contactId },
      data: { active: false, isPrimary: false },
    });

    // Si era el principal, asciende otro para que el cliente no quede sin
    // interlocutor a quién llamar.
    const replacement = await tx.contact.findFirst({
      where: { clientId: contact.clientId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (replacement) {
      await tx.contact.update({
        where: { id: replacement.id },
        data: { isPrimary: true },
      });
    }

    return deactivated;
  });
}

// ── Sedes de entrega ─────────────────────────────────────────

export async function addAddress(
  user: SessionUser,
  clientId: string,
  input: AddressCreateInput,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { ownerId: true },
  });
  if (!client) throw new NotFoundError("El cliente");
  assertCanAccess(user, client.ownerId);

  return prisma.$transaction(async (tx) => {
    const existingCount = await tx.clientAddress.count({
      where: { clientId, active: true },
    });

    // La primera sede que se registra es, necesariamente, la principal.
    const isPrimary = existingCount === 0 ? true : input.isPrimary;

    if (isPrimary) {
      await tx.clientAddress.updateMany({
        where: { clientId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.clientAddress.create({
      data: { ...input, clientId, isPrimary },
    });
  });
}

/** Comprueba que la sede pertenece a un cliente al que se puede acceder. */
async function assertOwnsAddress(user: SessionUser, addressId: string) {
  const address = await prisma.clientAddress.findUnique({
    where: { id: addressId },
    select: { id: true, clientId: true, client: { select: { ownerId: true } } },
  });
  if (!address) throw new NotFoundError("La sede");
  assertCanAccess(user, address.client.ownerId);

  return address;
}

export async function updateAddress(
  user: SessionUser,
  addressId: string,
  input: AddressUpdateInput,
) {
  const address = await assertOwnsAddress(user, addressId);

  return prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.clientAddress.updateMany({
        where: {
          clientId: address.clientId,
          isPrimary: true,
          id: { not: addressId },
        },
        data: { isPrimary: false },
      });
    }

    return tx.clientAddress.update({ where: { id: addressId }, data: input });
  });
}

/**
 * Da de baja una sede. No se borra: los pedidos ya despachados apuntan a ella
 * y perderla dejaría sin dirección la remisión de una entrega pasada.
 */
export async function deactivateAddress(user: SessionUser, addressId: string) {
  const address = await assertOwnsAddress(user, addressId);

  const remaining = await prisma.clientAddress.count({
    where: { clientId: address.clientId, active: true, id: { not: addressId } },
  });

  // Sin ninguna sede activa no se le puede despachar nada al cliente.
  if (remaining === 0) {
    throw new BusinessRuleError(
      "Es la única sede activa del cliente. Registra otra antes de darla de baja.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const deactivated = await tx.clientAddress.update({
      where: { id: addressId },
      data: { active: false, isPrimary: false },
    });

    const replacement = await tx.clientAddress.findFirst({
      where: { clientId: address.clientId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, isPrimary: true },
    });
    if (replacement && !replacement.isPrimary) {
      await tx.clientAddress.update({
        where: { id: replacement.id },
        data: { isPrimary: true },
      });
    }

    return deactivated;
  });
}
