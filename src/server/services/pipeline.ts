import { prisma } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import { UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import {
  ALL_STAGES,
  OPEN_STAGES,
  shouldActivateClient,
  stageTransitionFields,
} from "@/lib/pipeline-stages";
import type {
  ActivityCreateInput,
  ActivityListQuery,
  OpportunityCreateInput,
  OpportunityListQuery,
  OpportunityStageInput,
  OpportunityUpdateInput,
} from "../validators/pipeline";

/**
 * Pipeline comercial: oportunidades y bitácora de actividades.
 *
 * Un VENDEDOR solo ve y mueve las oportunidades que tiene asignadas; el resto
 * de roles ve el pipeline completo.
 */

function opportunityScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { ownerId: user.id } : {};
}

function assertCanAccess(user: SessionUser, ownerId: string | null) {
  if (user.role === UserRole.VENDEDOR && ownerId !== user.id) {
    throw new ForbiddenError("Esta oportunidad no está asignada a ti.");
  }
}

const cardSelect = {
  id: true,
  title: true,
  stage: true,
  estimatedValue: true,
  expectedCloseDate: true,
  closedAt: true,
  lostReason: true,
  updatedAt: true,
  client: {
    select: { id: true, businessName: true, tradeName: true, status: true },
  },
  owner: { select: { id: true, name: true } },
  _count: { select: { activities: true } },
} as const;

export type OpportunityCard = Awaited<
  ReturnType<typeof listOpportunities>
>["columns"][number]["items"][number];

/**
 * Oportunidades agrupadas por etapa, listas para pintar el tablero.
 *
 * Se devuelven todas las columnas aunque estén vacías: un pipeline con huecos
 * comunica mejor dónde se está atascando la venta que una lista comprimida.
 */
export async function listOpportunities(
  user: SessionUser,
  query: OpportunityListQuery,
) {
  const { search, stage, ownerId, clientId, includeClosed } = query;

  const stages = includeClosed ? ALL_STAGES : OPEN_STAGES;

  const opportunities = await prisma.opportunity.findMany({
    where: {
      ...opportunityScope(user),
      ...(stage ? { stage } : { stage: { in: stages } }),
      ...(clientId ? { clientId } : {}),
      ...(ownerId && user.role !== UserRole.VENDEDOR ? { ownerId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              {
                client: {
                  businessName: { contains: search, mode: "insensitive" as const },
                },
              },
              {
                client: {
                  tradeName: { contains: search, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ expectedCloseDate: "asc" }, { updatedAt: "desc" }],
    select: cardSelect,
  });

  const visibleStages = stage ? [stage] : stages;

  const columns = visibleStages.map((columnStage) => {
    const items = opportunities.filter((item) => item.stage === columnStage);
    return {
      stage: columnStage,
      items,
      total: items.length,
      value: items.reduce((acc, item) => acc + Number(item.estimatedValue), 0),
    };
  });

  return {
    columns,
    total: opportunities.length,
    value: opportunities.reduce(
      (acc, item) => acc + Number(item.estimatedValue),
      0,
    ),
  };
}

export async function getOpportunity(user: SessionUser, id: string) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          sequence: true,
          businessName: true,
          tradeName: true,
          status: true,
          phone: true,
          contacts: {
            where: { active: true },
            orderBy: { isPrimary: "desc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              phone: true,
              whatsapp: true,
              isPrimary: true,
            },
          },
        },
      },
      owner: { select: { id: true, name: true } },
      activities: {
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!opportunity) throw new NotFoundError("La oportunidad");
  assertCanAccess(user, opportunity.ownerId);

  return opportunity;
}

export async function createOpportunity(
  user: SessionUser,
  input: OpportunityCreateInput,
) {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, ownerId: true },
  });
  if (!client) throw new NotFoundError("El cliente");

  if (user.role === UserRole.VENDEDOR && client.ownerId !== user.id) {
    throw new ForbiddenError("Este cliente no está en tu cartera.");
  }

  // Un vendedor siempre queda como responsable de lo que abre; un ADMIN puede
  // asignarlo a otro.
  const ownerId =
    user.role === UserRole.VENDEDOR ? user.id : (input.ownerId ?? user.id);

  return prisma.opportunity.create({
    data: { ...input, ownerId },
  });
}

export async function updateOpportunity(
  user: SessionUser,
  id: string,
  input: OpportunityUpdateInput,
) {
  const current = await prisma.opportunity.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!current) throw new NotFoundError("La oportunidad");
  assertCanAccess(user, current.ownerId);

  const { ownerId, ...rest } = input;
  if (ownerId !== undefined && user.role !== UserRole.ADMIN) {
    throw new ForbiddenError(
      "Solo un administrador puede reasignar oportunidades.",
    );
  }

  return prisma.opportunity.update({
    where: { id },
    data: { ...rest, ...(ownerId !== undefined ? { ownerId } : {}) },
  });
}

/**
 * Mueve una oportunidad de etapa.
 *
 * Ganar activa al cliente si seguía como prospecto: las dos cosas van en una
 * transacción porque describen el mismo hecho comercial.
 */
export async function changeOpportunityStage(
  user: SessionUser,
  id: string,
  input: OpportunityStageInput,
) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      stage: true,
      client: { select: { id: true, status: true } },
    },
  });
  if (!opportunity) throw new NotFoundError("La oportunidad");
  assertCanAccess(user, opportunity.ownerId);

  if (opportunity.stage === input.stage) return opportunity;

  const fields = stageTransitionFields(input.stage, input.lostReason);

  return prisma.$transaction(async (tx) => {
    if (shouldActivateClient(input.stage, opportunity.client.status)) {
      await tx.client.update({
        where: { id: opportunity.client.id },
        data: { status: "ACTIVO" },
      });
    }

    return tx.opportunity.update({
      where: { id },
      data: { stage: input.stage, ...fields },
    });
  });
}

// ── Actividades ──────────────────────────────────────────────

export async function listActivities(
  user: SessionUser,
  query: ActivityListQuery,
) {
  const { clientId, opportunityId, userId, onlyPending, page, pageSize } = query;

  const where = {
    ...(clientId ? { clientId } : {}),
    ...(opportunityId ? { opportunityId } : {}),
    // Un vendedor ve su propia agenda; los demás roles pueden filtrar.
    ...(user.role === UserRole.VENDEDOR
      ? { userId: user.id }
      : userId
        ? { userId }
        : {}),
    ...(onlyPending ? { completedAt: null } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: onlyPending
        ? [{ dueAt: "asc" }]
        : [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true } },
        client: { select: { id: true, businessName: true, tradeName: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function createActivity(
  user: SessionUser,
  input: ActivityCreateInput,
) {
  const { completed, ...data } = input;

  // Si la actividad cuelga de una oportunidad, se hereda su cliente para que
  // aparezca también en la ficha del cliente.
  let clientId = data.clientId;
  if (!clientId && data.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: data.opportunityId },
      select: { clientId: true },
    });
    clientId = opportunity?.clientId;
  }
  if (!clientId && data.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: { clientId: true },
    });
    clientId = order?.clientId;
  }

  return prisma.activity.create({
    data: {
      ...data,
      clientId,
      userId: user.id,
      completedAt: completed ? new Date() : null,
    },
  });
}

/** Marca una actividad pendiente como realizada. */
export async function completeActivity(user: SessionUser, id: string) {
  const activity = await prisma.activity.findUnique({
    where: { id },
    select: { id: true, userId: true, completedAt: true },
  });
  if (!activity) throw new NotFoundError("La actividad");

  if (user.role === UserRole.VENDEDOR && activity.userId !== user.id) {
    throw new ForbiddenError("Esta actividad no es tuya.");
  }
  if (activity.completedAt) return activity;

  return prisma.activity.update({
    where: { id },
    data: { completedAt: new Date() },
  });
}
