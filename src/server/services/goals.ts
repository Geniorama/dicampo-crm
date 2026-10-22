import { prisma } from "../db";
import { BusinessRuleError, NotFoundError } from "../errors";
import { ActivityType, UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { SOLD_STATUSES } from "./analytics";
import { elapsedFraction, goalProgress, monthBounds } from "@/lib/goals";
import type { GoalUpsertInput } from "../validators/goals";

/**
 * Metas mensuales y su cumplimiento.
 *
 * - **Ventas**: suma de los pedidos vendidos (no borradores ni cancelados) del
 *   mes, por vendedor del pedido. Mismo criterio que los reportes.
 * - **Clientes nuevos**: clientes cuyo **primer pedido vendido** cae en el
 *   mes, atribuidos al responsable del cliente. Crear un prospecto no cuenta:
 *   la meta es de clientes que compran.
 * - **Visitas realizadas**: actividades VISITA completadas en el mes. No tiene
 *   meta; acompaña a las otras dos.
 */

const scopeKey = (month: string, userId: string | null) => `${month}:${userId ?? "GENERAL"}`;

/** Fija la meta de un mes y alcance (asesor o general). Solo administración. */
export async function upsertGoal(input: GoalUpsertInput) {
  if (input.userId) {
    const advisor = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, active: true, role: true },
    });
    if (!advisor) throw new NotFoundError("El asesor");
    if (!advisor.active || (advisor.role !== UserRole.VENDEDOR && advisor.role !== UserRole.ADMIN)) {
      throw new BusinessRuleError("Las metas se asignan a asesores activos.");
    }
  }

  const userId = input.userId ?? null;

  return prisma.salesGoal.upsert({
    where: { scopeKey: scopeKey(input.month, userId) },
    update: {
      salesTarget: input.salesTarget,
      newClientsTarget: input.newClientsTarget,
    },
    create: {
      month: input.month,
      userId,
      scopeKey: scopeKey(input.month, userId),
      salesTarget: input.salesTarget,
      newClientsTarget: input.newClientsTarget,
    },
  });
}

export type AdvisorGoalRow = {
  userId: string;
  name: string;
  sales: ReturnType<typeof goalProgress>;
  newClients: ReturnType<typeof goalProgress>;
  visitsDone: number;
};

/**
 * Cumplimiento del mes. Un VENDEDOR ve su propia fila y la meta general; la
 * administración ve a todos los asesores.
 */
export async function getGoalsProgress(user: SessionUser, month: string, now: Date = new Date()) {
  const { start, end } = monthBounds(month);
  const elapsed = elapsedFraction(month, now);
  const inMonth = { gte: start, lt: end };

  const [goals, salesBySeller, firstOrders, visits, advisors] = await Promise.all([
    prisma.salesGoal.findMany({ where: { month } }),
    prisma.order.groupBy({
      by: ["sellerId"],
      where: { status: { in: SOLD_STATUSES }, orderDate: inMonth },
      _sum: { total: true },
    }),
    // Primer pedido vendido de cada cliente, en toda su historia.
    prisma.order.groupBy({
      by: ["clientId"],
      where: { status: { in: SOLD_STATUSES } },
      _min: { orderDate: true },
    }),
    prisma.activity.groupBy({
      by: ["userId"],
      where: { type: ActivityType.VISITA, completedAt: inMonth },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: [UserRole.VENDEDOR, UserRole.ADMIN] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  // Clientes cuyo primer pedido cae en el mes → responsable del cliente.
  const newClientIds = firstOrders
    .filter((row) => row._min.orderDate && row._min.orderDate >= start && row._min.orderDate < end)
    .map((row) => row.clientId);

  const newClientOwners = newClientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: newClientIds } },
        select: { ownerId: true },
      })
    : [];

  const salesByUser = new Map(
    salesBySeller.map((row) => [row.sellerId, Number(row._sum.total ?? 0)]),
  );
  const newClientsByUser = new Map<string | null, number>();
  for (const { ownerId } of newClientOwners) {
    newClientsByUser.set(ownerId, (newClientsByUser.get(ownerId) ?? 0) + 1);
  }
  const visitsByUser = new Map(visits.map((row) => [row.userId, row._count._all]));
  const goalByUser = new Map(goals.map((goal) => [goal.userId, goal]));

  const totalSales = [...salesByUser.values()].reduce((sum, value) => sum + value, 0);
  const general = goalByUser.get(null);

  // Un ADMIN con metas o ventas propias también aparece; sin nada, solo estorba.
  const visibleAdvisors = advisors.filter((advisor) => {
    if (user.role === UserRole.VENDEDOR) return advisor.id === user.id;
    if (advisor.role === UserRole.VENDEDOR) return true;
    return (
      goalByUser.has(advisor.id) ||
      salesByUser.has(advisor.id) ||
      newClientsByUser.has(advisor.id)
    );
  });

  const rows: AdvisorGoalRow[] = visibleAdvisors.map((advisor) => {
    const goal = goalByUser.get(advisor.id);
    return {
      userId: advisor.id,
      name: advisor.name,
      sales: goalProgress(Number(goal?.salesTarget ?? 0), salesByUser.get(advisor.id) ?? 0, elapsed),
      newClients: goalProgress(
        goal?.newClientsTarget ?? 0,
        newClientsByUser.get(advisor.id) ?? 0,
        elapsed,
      ),
      visitsDone: visitsByUser.get(advisor.id) ?? 0,
    };
  });

  const totalNewClients = [...newClientsByUser.values()].reduce((sum, value) => sum + value, 0);

  return {
    month,
    elapsed,
    general: {
      sales: goalProgress(Number(general?.salesTarget ?? 0), totalSales, elapsed),
      newClients: goalProgress(general?.newClientsTarget ?? 0, totalNewClients, elapsed),
      visitsDone: [...visitsByUser.values()].reduce((sum, value) => sum + value, 0),
    },
    advisors: rows,
  };
}

/** Metas ya fijadas de un mes, para precargar el formulario de administración. */
export async function listGoals(month: string) {
  const goals = await prisma.salesGoal.findMany({ where: { month } });

  return goals.map((goal) => ({
    userId: goal.userId,
    salesTarget: Number(goal.salesTarget),
    newClientsTarget: goal.newClientsTarget,
  }));
}
