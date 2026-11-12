import { prisma } from "../db";
import { scopeToOwnPortfolio, type SessionUser } from "../guards";
import { ActivityType, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { bogotaMonthKey, monthRange } from "@/lib/client-sales";
import type { MyClientsQuery } from "../validators/my-clients";

/** Gestiones que el asesor registra desde la lista. */
export const MANAGEMENT_TYPES = [
  ActivityType.WHATSAPP,
  ActivityType.LLAMADA,
  ActivityType.VISITA,
] as const;

/**
 * Cartera del asesor con los filtros del módulo "Mis clientes".
 *
 * Un VENDEDOR solo ve la suya (`scopeToOwnPortfolio`); un ADMIN ve todas y
 * puede acotar por asesor. Los prospectos no son clientes: viven en el pipeline.
 */
export async function listMyClients(user: SessionUser, query: MyClientsQuery) {
  const range = query.lastOrderMonth ? monthRange(query.lastOrderMonth) : null;

  const and: Prisma.ClientWhereInput[] = [];
  if (query.search) {
    and.push({
      OR: [
        { businessName: { contains: query.search, mode: "insensitive" } },
        { tradeName: { contains: query.search, mode: "insensitive" } },
        { nit: { contains: query.search } },
      ],
    });
  }
  if (query.locality) {
    and.push({
      addresses: {
        some: { active: true, locality: { equals: query.locality, mode: "insensitive" } },
      },
    });
  }
  if (query.zoneId) {
    and.push({ addresses: { some: { active: true, zoneId: query.zoneId } } });
  }

  const where: Prisma.ClientWhereInput = {
    ...scopeToOwnPortfolio(user),
    status: { not: "PROSPECTO" },
    ...(query.relationStatus ? { relationStatus: query.relationStatus } : {}),
    // "Lunes / Jueves" se guarda como texto: se busca el nombre del día dentro.
    ...(query.orderDay ? { orderDay: { contains: query.orderDay, mode: "insensitive" } } : {}),
    ...(query.deliveryDay
      ? { deliveryDay: { contains: query.deliveryDay, mode: "insensitive" } }
      : {}),
    ...(range ? { lastOrderAt: { gte: range.from, lt: range.to } } : {}),
    ...(query.ownerId && user.role !== UserRole.VENDEDOR ? { ownerId: query.ownerId } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { businessName: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        sequence: true,
        businessName: true,
        tradeName: true,
        phone: true,
        relationStatus: true,
        orderDay: true,
        deliveryDay: true,
        orderCount: true,
        avgTicket: true,
        lastOrderAt: true,
        owner: { select: { id: true, name: true } },
        addresses: {
          where: { active: true },
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: { locality: true, zone: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.client.count({ where }),
  ]);

  // Última gestión (WhatsApp, llamada o visita) de cada cliente de la página.
  const lastActivities = await prisma.activity.findMany({
    where: { clientId: { in: items.map((c) => c.id) }, type: { in: [...MANAGEMENT_TYPES] } },
    orderBy: { createdAt: "desc" },
    distinct: ["clientId"],
    select: { clientId: true, type: true, createdAt: true },
  });
  const lastByClient = new Map(lastActivities.map((a) => [a.clientId, a]));

  return {
    items: items.map((client) => ({
      ...client,
      avgTicket: Number(client.avgTicket),
      locality: client.addresses[0]?.locality ?? null,
      zone: client.addresses[0]?.zone ?? null,
      lastManagement: lastByClient.get(client.id) ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Opciones de los filtros que salen de los datos: localidades, zonas y meses con pedidos. */
export async function getMyClientsFilterOptions(user: SessionUser) {
  const scope = { ...scopeToOwnPortfolio(user), status: { not: "PROSPECTO" as const } };

  const [zones, addresses, dates, owners] = await Promise.all([
    prisma.deliveryZone.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.clientAddress.findMany({
      where: { active: true, locality: { not: null }, client: scope },
      distinct: ["locality"],
      orderBy: { locality: "asc" },
      select: { locality: true },
    }),
    prisma.client.findMany({
      where: { ...scope, lastOrderAt: { not: null } },
      select: { lastOrderAt: true },
    }),
    user.role === UserRole.VENDEDOR
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { role: { in: [UserRole.VENDEDOR, UserRole.ADMIN] }, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ]);

  const months = [
    ...new Set(dates.map((row) => bogotaMonthKey(row.lastOrderAt as Date))),
  ].sort((a, b) => b.localeCompare(a));

  return {
    zones,
    localities: addresses.map((a) => a.locality as string),
    months,
    owners,
  };
}
