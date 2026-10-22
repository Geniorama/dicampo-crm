import { prisma } from "../db";
import { ActivityType, UserRole } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";

/**
 * Gestión diaria: qué hizo cada asesor hoy con su base de clientes.
 *
 * Cuenta las interacciones registradas en la bitácora (llamadas, WhatsApp,
 * visitas, muestras), a cuántos clientes distintos tocó y cuánto cobró. Es el
 * pulso del día, no un reporte histórico: para eso están los reportes.
 */

const TRACKED_TYPES: ActivityType[] = [
  ActivityType.LLAMADA,
  ActivityType.WHATSAPP,
  ActivityType.VISITA,
  ActivityType.MUESTRA,
];

/** Límites del día de Bogotá que contiene a `now`. */
export function bogotaDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const local = new TZDate(now, BUSINESS_TIME_ZONE);
  const start = new Date(
    new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0, BUSINESS_TIME_ZONE),
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export type DailyRow = {
  userId: string;
  name: string;
  calls: number;
  whatsapp: number;
  visits: number;
  samples: number;
  clientsTouched: number;
  collected: number;
};

export async function getDailyActivity(user: SessionUser, now: Date = new Date()): Promise<DailyRow[]> {
  const { start, end } = bogotaDayBounds(now);
  const today = { gte: start, lt: end };

  const [activities, payments, advisors] = await Promise.all([
    prisma.activity.findMany({
      where: { type: { in: TRACKED_TYPES }, createdAt: today },
      select: { userId: true, type: true, clientId: true },
    }),
    prisma.payment.groupBy({
      by: ["userId"],
      where: { createdAt: today },
      _sum: { amount: true },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: [UserRole.VENDEDOR] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const collected = new Map(payments.map((row) => [row.userId, Number(row._sum.amount ?? 0)]));

  return advisors
    .filter((advisor) => user.role !== UserRole.VENDEDOR || advisor.id === user.id)
    .map((advisor) => {
      const mine = activities.filter((activity) => activity.userId === advisor.id);
      const count = (type: ActivityType) => mine.filter((activity) => activity.type === type).length;

      return {
        userId: advisor.id,
        name: advisor.name,
        calls: count(ActivityType.LLAMADA),
        whatsapp: count(ActivityType.WHATSAPP),
        visits: count(ActivityType.VISITA),
        samples: count(ActivityType.MUESTRA),
        clientsTouched: new Set(mine.map((activity) => activity.clientId).filter(Boolean)).size,
        collected: collected.get(advisor.id) ?? 0,
      };
    });
}

