import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { UserRole } from "@/generated/prisma/enums";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { listAdvisors } from "@/server/services/visit-schedules";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { USER_ROLE_LABEL, WEEKDAY_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Disponibilidad" };

/**
 * Un vendedor va directo a su propia disponibilidad; el administrador elige
 * a quién configurar.
 */
export default async function AvailabilityIndexPage() {
  const user = await requireUserPage(SALES_ROLES);
  if (user.role !== UserRole.ADMIN) redirect(`/agenda/disponibilidad/${user.id}`);

  const advisors = await listAdvisors(user);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Disponibilidad de asesores"
        description="Horario en que cada asesor puede visitar clientes. El agente de WhatsApp solo ofrece y agenda visitas dentro de él."
      />

      <Card>
        {advisors.length === 0 ? (
          <EmptyState
            title="No hay asesores activos"
            description="Crea usuarios con rol Vendedor para configurar su agenda."
          />
        ) : (
          <ul className="divide-y divide-border">
            {advisors.map((advisor) => (
              <li
                key={advisor.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/agenda/disponibilidad/${advisor.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {advisor.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {USER_ROLE_LABEL[advisor.role]} ·{" "}
                    {advisor.usesDefault
                      ? "horario general"
                      : advisor.weekdays
                          .map((weekday) => WEEKDAY_LABEL[weekday].slice(0, 3))
                          .join(", ")}
                  </p>
                </div>
                {!advisor.acceptsVisits ? (
                  <Badge tone="neutral">No recibe visitas</Badge>
                ) : advisor.usesDefault ? (
                  <Badge tone="info">Horario general</Badge>
                ) : (
                  <Badge tone="success">Horario propio</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
