import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { UserRole } from "@/generated/prisma/enums";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { getAdvisorSchedule } from "@/server/services/visit-schedules";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ScheduleEditor } from "@/components/scheduling/schedule-editor";
import { BlockManager } from "@/components/scheduling/block-manager";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Disponibilidad" };

export default async function AdvisorAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const { id } = await params;

  // Un vendedor solo configura su propia agenda: en vez de un 403 se le lleva
  // a la suya.
  if (user.role !== UserRole.ADMIN && user.id !== id) {
    redirect(`/agenda/disponibilidad/${user.id}`);
  }

  const schedule = await getAdvisorSchedule(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const isOwn = user.id === id;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={isOwn ? "Mi disponibilidad" : `Disponibilidad de ${schedule.advisor.name}`}
        description="Hora de Bogotá. El agente de WhatsApp solo ofrece y agenda visitas dentro de estas franjas, respetando la duración, el traslado y las ausencias."
        actions={
          user.role === UserRole.ADMIN && (
            <Link
              href="/agenda/disponibilidad"
              className={buttonVariants({ variant: "secondary" })}
            >
              Todos los asesores
            </Link>
          )
        }
      />

      {schedule.usesDefault && (
        <p role="status" className="rounded-md bg-info-subtle px-4 py-3 text-sm text-info">
          {isOwn ? "Aún no has configurado tu horario" : "Este asesor aún no tiene horario propio"}
          : se aplica el horario general, que es el que ves abajo. Al guardar
          quedará como horario propio.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Horario semanal</CardTitle>
        </CardHeader>
        <ScheduleEditor
          advisorId={id}
          settings={schedule.settings}
          windows={schedule.windows}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ausencias</CardTitle>
        </CardHeader>
        <BlockManager
          advisorId={id}
          blocks={schedule.blocks.map((block) => ({
            id: block.id,
            label: `${formatDateTime(block.startsAt)} → ${formatDateTime(block.endsAt)}`,
            reason: block.reason,
          }))}
        />
      </Card>
    </div>
  );
}
