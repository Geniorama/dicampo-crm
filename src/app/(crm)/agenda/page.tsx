import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { UserRole } from "@/generated/prisma/enums";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { listAdvisors, listVisitAgenda } from "@/server/services/visit-schedules";
import { visitAgendaQuerySchema } from "@/server/validators/visit-schedules";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { CompleteActivityButton } from "@/components/pipeline/complete-activity-button";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { bogotaParts, formatDayLabel, formatHour } from "@/lib/visit-schedule";

export const metadata: Metadata = { title: "Agenda" };

/**
 * Visitas comerciales del período: las que agenda el agente de WhatsApp y las
 * que registran los vendedores como actividad VISITA con fecha.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const query = visitAgendaQuerySchema.parse(flattenSearchParams(await searchParams));
  const isAdmin = user.role === UserRole.ADMIN;

  const [{ from, items }, advisors] = await Promise.all([
    listVisitAgenda(user, query),
    isAdmin ? listAdvisors(user) : Promise.resolve([]),
  ]);

  // Agrupadas por día de Bogotá, no del servidor (que corre en UTC).
  const days = new Map<string, typeof items>();
  for (const item of items) {
    const key = bogotaParts(item.dueAt!).date;
    days.set(key, [...(days.get(key) ?? []), item]);
  }

  const pending = items.filter((item) => !item.completedAt).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda"
        description={`${pending} ${pending === 1 ? "visita pendiente" : "visitas pendientes"} en el período`}
        actions={
          <Link
            href="/agenda/disponibilidad"
            className={buttonVariants({ variant: "secondary" })}
          >
            <CalendarClock aria-hidden="true" />
            {isAdmin ? "Disponibilidad de asesores" : "Mi disponibilidad"}
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <Input id="from" name="from" type="date" defaultValue={from} className="mt-1" />
          </div>

          <div>
            <label htmlFor="days" className="text-xs font-medium text-muted-foreground">
              Período
            </label>
            <Select id="days" name="days" defaultValue={String(query.days)} className="mt-1">
              <option value="1">1 día</option>
              <option value="7">7 días</option>
              <option value="14">14 días</option>
              <option value="31">31 días</option>
            </Select>
          </div>

          {isAdmin && (
            <div>
              <label htmlFor="userId" className="text-xs font-medium text-muted-foreground">
                Asesor
              </label>
              <Select
                id="userId"
                name="userId"
                defaultValue={query.userId ?? ""}
                className="mt-1"
              >
                <option value="">Todos</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label htmlFor="includeDone" className="text-xs font-medium text-muted-foreground">
              Mostrar
            </label>
            <Select
              id="includeDone"
              name="includeDone"
              defaultValue={query.includeDone ? "1" : "0"}
              className="mt-1"
            >
              <option value="0">Solo pendientes</option>
              <option value="1">Incluir realizadas</option>
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay visitas en este período"
            description="Las visitas que agenda el agente de WhatsApp y las actividades de tipo Visita con fecha aparecen aquí."
          />
        </Card>
      ) : (
        [...days.entries()].map(([day, dayItems]) => (
          <Card key={day}>
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold capitalize text-foreground">
              {formatDayLabel(day)}
            </h2>
            <ul className="divide-y divide-border">
              {dayItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start"
                >
                  <div className="tabular w-24 shrink-0 text-sm font-medium text-foreground">
                    {formatHour(bogotaParts(item.dueAt!).minutes)}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.client ? (
                        <Link
                          href={`/clientes/${item.client.id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {item.client.tradeName ?? item.client.businessName}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-foreground">
                          {item.subject}
                        </span>
                      )}
                      {item.completedAt && <Badge tone="success">Realizada</Badge>}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {[isAdmin ? item.user.name : null, item.subject]
                        .filter(Boolean)
                        .join(" · ")}
                      {item.opportunity && (
                        <>
                          {" · "}
                          <Link
                            href={`/pipeline/${item.opportunity.id}`}
                            className="text-primary hover:underline"
                          >
                            {item.opportunity.title}
                          </Link>
                        </>
                      )}
                    </p>

                    {item.notes && (
                      <p className="whitespace-pre-line text-sm text-foreground">{item.notes}</p>
                    )}
                  </div>

                  {!item.completedAt && (
                    <div className="md:shrink-0">
                      <CompleteActivityButton activityId={item.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
