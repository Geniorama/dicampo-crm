import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { ForbiddenError, NotFoundError } from "../errors";
import type { SessionUser } from "../guards";
import {
  VISIT_RULES,
  addDays,
  bogotaMoment,
  policyFromSchedule,
  todayInBogota,
  type VisitPolicy,
} from "@/lib/visit-schedule";
import type {
  BlockCreateInput,
  ScheduleUpdateInput,
  VisitAgendaQuery,
} from "../validators/visit-schedules";

/**
 * Disponibilidad de visitas de cada asesor.
 *
 * Las visitas son actividades VISITA con `dueAt` en la agenda del asesor; lo
 * que se configura aquí es **cuándo** puede hacerlas. El agente de WhatsApp
 * (services/agent.ts) carga esta política con `loadVisitPolicy` para ofrecer
 * franjas y para validar la que el cliente elige. Quien no ha configurado
 * nada usa el horario general de `VISIT_RULES`.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** Roles que hacen visitas. ADMIN incluido: recibe las de clientes sin vendedor. */
export const ADVISOR_ROLES: UserRole[] = [UserRole.VENDEDOR, UserRole.ADMIN];

/** Lo que ve en el editor un asesor que aún no ha configurado nada. */
const DEFAULT_SETTINGS = {
  acceptsVisits: true,
  visitMinutes: VISIT_RULES.durationMinutes,
  bufferMinutes: VISIT_RULES.bufferMinutes,
  minLeadDays: VISIT_RULES.minLeadDays,
  maxDaysAhead: VISIT_RULES.maxDaysAhead,
};

const DEFAULT_WINDOWS = VISIT_RULES.weekdays.map((weekday) => ({
  weekday,
  startMinute: VISIT_RULES.startMinutes,
  endMinute: VISIT_RULES.endMinutes,
}));

/** Un VENDEDOR solo gestiona su propia agenda; ADMIN gestiona la de todos. */
function assertCanManage(user: SessionUser, advisorId: string) {
  if (user.role !== UserRole.ADMIN && user.id !== advisorId) {
    throw new ForbiddenError("Solo puedes gestionar tu propia agenda.");
  }
}

async function findAdvisor(advisorId: string) {
  const advisor = await prisma.user.findUnique({
    where: { id: advisorId },
    select: {
      id: true,
      name: true,
      role: true,
      active: true,
      visitSchedule: { include: { windows: true } },
    },
  });
  if (!advisor || !ADVISOR_ROLES.includes(advisor.role)) {
    throw new NotFoundError("El asesor");
  }
  return advisor;
}

// ── Política que usa el agente ───────────────────────────────

/**
 * Horario de visitas de un asesor, con sus ausencias vigentes. `accepts` es
 * falso si el asesor apagó la recepción de visitas: entonces no se le ofrece
 * ni se le agenda nada.
 */
export async function loadVisitPolicy(
  db: Db,
  userId: string,
): Promise<{ accepts: boolean; policy: VisitPolicy }> {
  // En serie: dentro de una transacción comparten conexión.
  const schedule = await db.advisorSchedule.findUnique({
    where: { userId },
    include: { windows: true },
  });
  const blocks = await db.availabilityBlock.findMany({
    where: { userId, endsAt: { gt: new Date() } },
    select: { startsAt: true, endsAt: true },
  });

  return {
    accepts: schedule?.acceptsVisits ?? true,
    policy: policyFromSchedule(schedule, blocks),
  };
}

// ── Configuración desde el CRM ───────────────────────────────

/** Asesores visibles: un VENDEDOR se ve solo a sí mismo. */
export async function listAdvisors(user: SessionUser) {
  const advisors = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ADVISOR_ROLES },
      ...(user.role === UserRole.ADMIN ? {} : { id: user.id }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      visitSchedule: {
        select: {
          acceptsVisits: true,
          windows: { select: { weekday: true } },
        },
      },
    },
  });

  return advisors.map(({ visitSchedule, ...advisor }) => ({
    ...advisor,
    acceptsVisits: visitSchedule?.acceptsVisits ?? true,
    /** Sin franjas propias, el asesor usa el horario general. */
    usesDefault: !visitSchedule || visitSchedule.windows.length === 0,
    weekdays: [...new Set(visitSchedule?.windows.map((window) => window.weekday) ?? [])].sort(),
  }));
}

export async function getAdvisorSchedule(user: SessionUser, advisorId: string) {
  assertCanManage(user, advisorId);
  const advisor = await findAdvisor(advisorId);
  const schedule = advisor.visitSchedule;
  const usesDefault = !schedule || schedule.windows.length === 0;

  const blocks = await prisma.availabilityBlock.findMany({
    where: { userId: advisorId, endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });

  return {
    advisor: { id: advisor.id, name: advisor.name, active: advisor.active },
    usesDefault,
    settings: schedule
      ? {
          acceptsVisits: schedule.acceptsVisits,
          visitMinutes: schedule.visitMinutes,
          bufferMinutes: schedule.bufferMinutes,
          minLeadDays: schedule.minLeadDays,
          maxDaysAhead: schedule.maxDaysAhead,
        }
      : DEFAULT_SETTINGS,
    // Sin franjas propias el editor arranca con el horario general, para que
    // guardar sin tocar nada no cambie lo que el agente ofrece.
    windows: (usesDefault ? DEFAULT_WINDOWS : schedule.windows)
      .map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }))
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute),
    blocks,
  };
}

/**
 * Guarda la configuración completa. Las franjas se reemplazan en bloque:
 * el editor manda la semana entera y ninguna otra tabla las referencia.
 */
export async function updateAdvisorSchedule(
  user: SessionUser,
  advisorId: string,
  input: ScheduleUpdateInput,
) {
  assertCanManage(user, advisorId);
  await findAdvisor(advisorId);

  const { windows, ...settings } = input;

  await prisma.$transaction(async (tx) => {
    await tx.advisorSchedule.upsert({
      where: { userId: advisorId },
      create: { userId: advisorId, ...settings },
      update: settings,
    });
    await tx.availabilityWindow.deleteMany({ where: { userId: advisorId } });
    if (windows.length > 0) {
      await tx.availabilityWindow.createMany({
        data: windows.map((window) => ({ ...window, userId: advisorId })),
      });
    }
  });

  return getAdvisorSchedule(user, advisorId);
}

export async function createBlock(
  user: SessionUser,
  advisorId: string,
  input: BlockCreateInput,
) {
  assertCanManage(user, advisorId);
  await findAdvisor(advisorId);

  // La ausencia cuelga de la configuración. Si el asesor aún no la tiene, se
  // crea vacía: sin franjas propias sigue con el horario general.
  await prisma.advisorSchedule.upsert({
    where: { userId: advisorId },
    create: { userId: advisorId, ...DEFAULT_SETTINGS },
    update: {},
  });

  return prisma.availabilityBlock.create({
    data: {
      userId: advisorId,
      startsAt: bogotaMoment(input.fromDate, input.startTime),
      endsAt: bogotaMoment(input.toDate, input.endTime),
      reason: input.reason,
    },
  });
}

/** Las ausencias son configuración, no historia: se pueden borrar. */
export async function deleteBlock(user: SessionUser, blockId: string) {
  const block = await prisma.availabilityBlock.findUnique({
    where: { id: blockId },
    select: { userId: true },
  });
  if (!block) throw new NotFoundError("La ausencia");
  assertCanManage(user, block.userId);

  await prisma.availabilityBlock.delete({ where: { id: blockId } });
}

// ── Agenda de visitas ────────────────────────────────────────

/**
 * Visitas (actividades VISITA con fecha) de un período, para la pantalla de
 * agenda. Un VENDEDOR ve solo las suyas.
 */
export async function listVisitAgenda(user: SessionUser, query: VisitAgendaQuery) {
  const from = query.from ?? todayInBogota();
  const userId = user.role === UserRole.ADMIN ? query.userId : user.id;

  const items = await prisma.activity.findMany({
    where: {
      type: "VISITA",
      dueAt: {
        gte: bogotaMoment(from, 0),
        lt: bogotaMoment(addDays(from, query.days), 0),
      },
      ...(userId ? { userId } : {}),
      ...(query.includeDone ? {} : { completedAt: null }),
    },
    orderBy: { dueAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
      client: { select: { id: true, businessName: true, tradeName: true } },
      opportunity: { select: { id: true, title: true } },
    },
  });

  return { from, days: query.days, items };
}
