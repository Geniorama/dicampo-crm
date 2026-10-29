import type { Metadata } from "next";
import { DISPATCH_ROLES, requireUserPage } from "@/server/guards";
import { listSchedules } from "@/server/services/route-schedules";
import { PageHeader } from "@/components/layout/page-header";
import {
  ScheduleManager,
  type ScheduleRow,
} from "@/components/routes/schedule-manager";
import { WEEKDAY_LABEL } from "@/lib/route-schedule";

export const metadata: Metadata = { title: "Rutas recurrentes" };

export default async function SchedulesPage() {
  await requireUserPage(DISPATCH_ROLES);

  const schedules = await listSchedules();
  const rows: ScheduleRow[] = schedules.map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    weekday: WEEKDAY_LABEL[schedule.weekday] ?? String(schedule.weekday),
    zone: schedule.zone?.name ?? null,
    driver: schedule.driver?.name ?? null,
    vehicle: schedule.vehicle,
    active: schedule.active,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Rutas recurrentes"
        description="Se crean marcando «Repetir cada semana» al crear una ruta. El sistema genera las rutas de las próximas dos semanas; pausar una retira las futuras que aún no tienen pedidos."
      />
      <ScheduleManager schedules={rows} />
    </div>
  );
}
