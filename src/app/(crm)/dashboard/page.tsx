import Link from "next/link";
import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import {
  getClientsWithOrder,
  getDashboardMetrics,
  getMonthlySalesBySegment,
  getQuoteMixByMonth,
} from "@/server/services/reports";
import { getGoalsProgress } from "@/server/services/goals";
import { listReceivables } from "@/server/services/receivables";
import {
  getDailyActivity,
  getOrderCounters,
  getProductionPriorities,
  listDayOrders,
  type DayOrdersTab,
} from "@/server/services/daily-activity";
import { DailyBoard } from "@/components/dashboard/daily-board";
import type { RawSearchParams } from "@/lib/search-params";
import { GoalMeter } from "@/components/goals/goal-meter";
import { GroupedBars } from "@/components/reports/grouped-bars";
import { BarList } from "@/components/ui/bar-list";
import { currentMonth } from "@/lib/goals";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { formatCOP } from "@/lib/format";

const AGING_BAR: Record<string, string> = {
  AL_DIA: "bg-primary",
  "1_30": "bg-warning",
  "31_60": "bg-brand-orange",
  MAS_60: "bg-destructive",
};

export const metadata: Metadata = { title: "Tablero" };

/** "50 %" o "Sin meta" cuando la meta no está fijada. */
function percentLabel(percent: number | null): string {
  return percent === null ? "Sin meta" : `${Math.round(percent)} %`;
}

/** "2026-10" → "octubre de 2026" */
function formatMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, number - 1, 1)),
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const tab: DayOrdersTab = params.tab === "hoy" ? "hoy" : "ayer";
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);
  const user = await requireUserPage(SALES_ROLES);
  // Las metas son del equipo comercial; bodega y despacho no las ven.
  const showGoals = user.role === "ADMIN" || user.role === "VENDEDOR";
  const month = currentMonth();
  const [metrics, segments, quoteMix, clientsWithOrder, goals, receivables, daily, counters, dayOrders, priorities] = await Promise.all([
    getDashboardMetrics(user),
    getMonthlySalesBySegment(user),
    getQuoteMixByMonth(user),
    getClientsWithOrder(user),
    showGoals ? getGoalsProgress(user, month) : null,
    showGoals ? listReceivables(user, { overdueOnly: false }) : null,
    showGoals ? getDailyActivity(user) : null,
    getOrderCounters(user),
    listDayOrders(user, tab, page),
    getProductionPriorities(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">
          Hola, {user.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen de la operación de hoy.
        </p>
      </header>

      <section
        aria-label="Indicadores"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Ventas del mes"
          value={formatCOP(metrics.monthRevenue)}
          hint={
            goals && goals.general.sales.target > 0
              ? `${percentLabel(goals.general.sales.percent)} de la meta de ${formatCOP(goals.general.sales.target)}`
              : "Sin meta fijada para el mes"
          }
        />
        <StatCard
          label="Clientes nuevos"
          value={goals ? goals.general.newClients.achieved : 0}
          hint={
            goals && goals.general.newClients.target > 0
              ? `${percentLabel(goals.general.newClients.percent)} de la meta de ${goals.general.newClients.target}`
              : "Sin meta fijada para el mes"
          }
        />
        <StatCard
          label="Clientes con pedido"
          value={clientsWithOrder.withOrder}
          hint={`de ${clientsWithOrder.total} clientes en la base`}
        />
        <StatCard
          label="Cartera"
          value={formatCOP(receivables?.totals.balance ?? 0)}
          hint={`frente a ${formatCOP(metrics.monthRevenue)} de ventas del mes`}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas de los últimos 6 meses</CardTitle>
            <Link href="/reportes" className="text-xs font-medium text-primary hover:underline">
              Ver reportes
            </Link>
          </CardHeader>
          <GroupedBars
            title="Ventas por mes: superdistribuidores frente al equipo comercial"
            series={[
              { key: "superDistributors", label: "Superdistribuidores", color: "var(--info)" },
              { key: "commercial", label: "Equipo comercial", color: "var(--brand-orange)" },
            ]}
            points={segments.map((point) => ({
              key: point.key,
              values: { superDistributors: point.superDistributors, commercial: point.commercial },
            }))}
            format={formatCOP}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones de los últimos 6 meses</CardTitle>
            <span className="text-xs text-muted-foreground">Clientes nuevos y actuales</span>
          </CardHeader>
          <GroupedBars
            title="Cotizaciones por mes a clientes nuevos y a clientes actuales"
            series={[
              { key: "newClients", label: "Clientes nuevos", color: "var(--brand-orange)" },
              { key: "currentClients", label: "Clientes actuales", color: "var(--info)" },
            ]}
            points={quoteMix.map((point) => ({
              key: point.key,
              values: { newClients: point.newClients, currentClients: point.currentClients },
            }))}
            format={(value) => String(value)}
          />
        </Card>
      </div>

      {receivables && receivables.totals.balance > 0 && (
        <section aria-label="Cartera" className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Cartera por cobrar"
            value={formatCOP(receivables.totals.balance)}
            hint={`${receivables.totals.clientCount} clientes con saldo`}
          />
          <Link href="/cartera?overdueOnly=1" className="block">
            <StatCard
              label="Cartera vencida"
              value={formatCOP(receivables.totals.overdue)}
              hint={receivables.totals.overdue > 0 ? "Ver clientes por cobrar" : "Todo al día"}
            />
          </Link>
        </section>
      )}

      {receivables && receivables.totals.balance > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cartera por antigüedad</CardTitle>
            <Link href="/cartera" className="text-xs font-medium text-primary hover:underline">
              Ver cartera
            </Link>
          </CardHeader>
          <BarList
            label="Saldo por cobrar según los días de vencimiento"
            rows={receivables.aging.map((row) => ({
              key: row.bucket,
              label: row.label,
              value: row.amount,
              display: formatCOP(row.amount),
              barClass: AGING_BAR[row.bucket],
            }))}
          />
        </Card>
      )}

      {goals && (
        <Card>
          <CardHeader>
            <CardTitle>Metas de {formatMonth(month)}</CardTitle>
            {user.role === "ADMIN" && (
              <Link href="/metas" className="text-xs font-medium text-primary hover:underline">
                Definir metas
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <GoalMeter label="Meta general · ventas" progress={goals.general.sales} format={formatCOP} />
              <GoalMeter
                label="Meta general · clientes nuevos"
                progress={goals.general.newClients}
                format={(value) => String(value)}
              />
            </div>

            {goals.advisors.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">Asesor</th>
                      <th scope="col" className="px-4 py-2 font-medium">Ventas</th>
                      <th scope="col" className="px-4 py-2 font-medium">Clientes nuevos</th>
                      <th scope="col" className="py-2 pl-4 text-right font-medium">Cartera pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goals.advisors.map((advisor) => (
                      <tr key={advisor.userId} className="border-b border-border align-top last:border-0">
                        <td className="py-3 pr-4 font-medium text-foreground">{advisor.name}</td>
                        <td className="min-w-52 px-4 py-3">
                          <GoalMeter label={`Ventas de ${advisor.name}`} progress={advisor.sales} format={formatCOP} />
                        </td>
                        <td className="min-w-44 px-4 py-3">
                          <GoalMeter
                            label={`Clientes nuevos de ${advisor.name}`}
                            progress={advisor.newClients}
                            format={(value) => String(value)}
                          />
                        </td>
                        <td className="tabular py-3 pl-4 text-right text-foreground">{formatCOP(advisor.pendingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {daily && (
        <DailyBoard
          rows={daily}
          counters={counters}
          tab={tab}
          dayOrders={dayOrders}
          searchParams={params}
          priorities={priorities}
        />
      )}

      {metrics.overdueActivities > 0 && (
        <p
          role="status"
          className="rounded-md bg-warning-subtle px-4 py-3 text-sm text-warning"
        >
          Tienes {metrics.overdueActivities}{" "}
          {metrics.overdueActivities === 1
            ? "actividad vencida"
            : "actividades vencidas"}{" "}
          por atender.
        </p>
      )}
    </div>
  );
}
