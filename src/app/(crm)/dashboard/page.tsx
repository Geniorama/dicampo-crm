import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import {
  getDashboardMetrics,
  getMonthlySales,
  getMonthOrdersByStatus,
  getRecentOrders,
} from "@/server/services/reports";
import { getGoalsProgress } from "@/server/services/goals";
import { listReceivables } from "@/server/services/receivables";
import { getDailyActivity } from "@/server/services/daily-activity";
import { GoalMeter } from "@/components/goals/goal-meter";
import { TrendChart } from "@/components/reports/trend-chart";
import { BarList } from "@/components/ui/bar-list";
import { DonutChart } from "@/components/ui/donut-chart";
import { currentMonth } from "@/lib/goals";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatDate, formatOrderNumber } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";

/** Color de cada estado en la dona; los mismos tonos que sus insignias. */
const ORDER_STATUS_COLOR: Record<string, string> = {
  BORRADOR: "var(--muted-foreground)",
  CONFIRMADO: "var(--info)",
  EN_PREPARACION: "var(--warning)",
  DESPACHADO: "var(--primary)",
  ENTREGADO: "var(--primary-strong)",
  CANCELADO: "var(--destructive)",
};

const AGING_BAR: Record<string, string> = {
  AL_DIA: "bg-primary",
  "1_30": "bg-warning",
  "31_60": "bg-brand-orange",
  MAS_60: "bg-destructive",
};

export const metadata: Metadata = { title: "Tablero" };

/** Variación porcentual entre dos periodos, tolerando el mes anterior en cero. */
function growthLabel(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "Sin comparativo" : "Sin ventas";
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(0)}% vs. mes anterior`;
}

/** "2026-10" → "octubre de 2026" */
function formatMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, number - 1, 1)),
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  // Las metas son del equipo comercial; bodega y despacho no las ven.
  const showGoals = user.role === "ADMIN" || user.role === "VENDEDOR";
  const month = currentMonth();
  const [metrics, monthly, byStatus, recentOrders, goals, receivables, daily] = await Promise.all([
    getDashboardMetrics(user),
    getMonthlySales(user),
    getMonthOrdersByStatus(user),
    getRecentOrders(user),
    showGoals ? getGoalsProgress(user, month) : null,
    showGoals ? listReceivables(user, { overdueOnly: false }) : null,
    showGoals ? getDailyActivity(user) : null,
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
          hint={growthLabel(metrics.monthRevenue, metrics.previousMonthRevenue)}
        />
        <StatCard
          label="Pedidos del mes"
          value={metrics.monthOrderCount}
          hint={`${metrics.pendingDispatch} pendientes de despacho`}
        />
        <StatCard
          label="Clientes activos"
          value={metrics.activeClients}
          hint={`${metrics.prospects} prospectos por convertir`}
        />
        <StatCard
          label="Lotes por vencer"
          value={metrics.expiringLots}
          hint="Con saldo y vencimiento en 30 días"
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
          <TrendChart points={monthly} granularity="mes" />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pedidos del mes por estado</CardTitle>
          </CardHeader>
          <DonutChart
            label="Reparto de los pedidos del mes por estado"
            centerLabel="pedidos"
            centerValue={String(byStatus.reduce((sum, row) => sum + row.count, 0))}
            slices={byStatus.map((row) => ({
              key: row.status,
              label: ORDER_STATUS_LABEL[row.status],
              value: row.count,
              color: ORDER_STATUS_COLOR[row.status],
            }))}
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
                      <th scope="col" className="py-2 pl-4 text-right font-medium">Visitas realizadas</th>
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
                        <td className="tabular py-3 pl-4 text-right text-foreground">{advisor.visitsDone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {daily && daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gestión de hoy</CardTitle>
            <Link href="/agenda" className="text-xs font-medium text-primary hover:underline">
              Ver agenda
            </Link>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Asesor</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Llamadas</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">WhatsApp</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Visitas</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Muestras</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Clientes tocados</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.userId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{row.name}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.calls}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.whatsapp}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.visits}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.samples}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.clientsTouched}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatCOP(row.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Últimos pedidos</CardTitle>
          <Link
            href="/pedidos"
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos
          </Link>
        </CardHeader>

        {recentOrders.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Aún no hay pedidos registrados.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Pedido</th>
                  <th scope="col" className="px-5 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-5 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-5 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/pedidos/${order.id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {formatOrderNumber(order.orderNumber)}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-foreground">
                      {order.client.tradeName ?? order.client.businessName}
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right font-medium text-foreground">
                      {formatCOP(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
