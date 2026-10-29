import { prisma } from "../db";
import { RouteStatus } from "@/generated/prisma/enums";
import { NotFoundError } from "../errors";
import { scheduledDates } from "@/lib/route-schedule";
import type { RouteScheduleUpdateInput } from "../validators/routes";
import { assertZoneAssignable } from "./zones";

/**
 * Rutas recurrentes ("todos los sábados").
 *
 * Una programación no lleva pedidos: genera rutas normales, una por fecha,
 * para los próximos días. Se generan al consultar (rutas, Mi ruta) en vez de
 * con una tarea programada, que Netlify no da. La llave única
 * (scheduleId, date) hace seguro que dos consultas a la vez generen lo mismo, y
 * una ruta cancelada no se vuelve a crear porque su fecha ya está ocupada.
 */

export async function listSchedules() {
  return prisma.routeSchedule.findMany({
    orderBy: [{ active: "desc" }, { weekday: "asc" }, { name: "asc" }],
    include: {
      zone: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true } },
    },
  });
}

/** Fecha de calendario de hoy en Bogotá, a medianoche UTC (como se guardan las rutas). */
function calendarToday(todayInBogota: string) {
  return new Date(`${todayInBogota}T00:00:00.000Z`);
}

/**
 * Crea las rutas que falten de las programaciones activas dentro del horizonte.
 * Idempotente.
 */
export async function materializeScheduledRoutes(todayInBogota: string) {
  const schedules = await prisma.routeSchedule.findMany({ where: { active: true } });

  const data = schedules.flatMap((schedule) =>
    scheduledDates(
      schedule.weekday,
      schedule.startsOn.toISOString().slice(0, 10),
      todayInBogota,
    ).map((day) => ({
      name: schedule.name,
      date: new Date(`${day}T00:00:00.000Z`),
      zoneId: schedule.zoneId,
      driverId: schedule.driverId,
      vehicle: schedule.vehicle,
      notes: schedule.notes,
      scheduleId: schedule.id,
    })),
  );

  if (data.length > 0) {
    await prisma.deliveryRoute.createMany({ data, skipDuplicates: true });
  }
}

/**
 * Cambia la programación y lo que heredan las rutas futuras que aún no
 * arrancan. Pausarla retira las futuras que no tienen pedidos; las que ya
 * tienen pedidos se respetan y se cancelan a mano si hace falta.
 */
export async function updateSchedule(
  id: string,
  input: RouteScheduleUpdateInput,
  todayInBogota: string,
) {
  const schedule = await prisma.routeSchedule.findUnique({
    where: { id },
    select: { zoneId: true },
  });
  if (!schedule) throw new NotFoundError("La ruta recurrente");
  await assertZoneAssignable(input.zoneId, schedule.zoneId);

  const { active, ...inherited } = input;
  const future = {
    scheduleId: id,
    status: RouteStatus.PLANEADA,
    date: { gte: calendarToday(todayInBogota) },
  };

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.routeSchedule.update({ where: { id }, data: input });

    if (active === false) {
      await tx.deliveryRoute.deleteMany({ where: { ...future, orders: { none: {} } } });
    } else if (Object.keys(inherited).length > 0) {
      await tx.deliveryRoute.updateMany({ where: future, data: inherited });
    }
    return result;
  });

  if (active === true) await materializeScheduledRoutes(todayInBogota);
  return updated;
}
