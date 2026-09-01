import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getDashboardMetrics, getRecentOrders } from "@/server/services/reports";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCOP, formatDate, formatOrderNumber } from "@/lib/format";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/lib/labels";

export const metadata: Metadata = { title: "Tablero" };

/** Variación porcentual entre dos periodos, tolerando el mes anterior en cero. */
function growthLabel(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "Sin comparativo" : "Sin ventas";
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(0)}% vs. mes anterior`;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [metrics, recentOrders] = await Promise.all([
    getDashboardMetrics(user),
    getRecentOrders(user),
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
