import Link from "next/link";
import {
  type DailyRow,
  type DayOrdersTab,
  type OrderCounters,
  type ProductionPriorityRow,
  type listDayOrders,
} from "@/server/services/daily-activity";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { formatCOP, formatOrderNumber } from "@/lib/format";
import { PRESENTATION_SHORT } from "@/lib/labels";
import { PRIORITY_REASON_LABEL } from "@/lib/production-priority";
import type { RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

type DayOrders = Awaited<ReturnType<typeof listDayOrders>>;

/** "Mango ×2 kg, Fresa ×1 lb" */
function describeItems(items: DayOrders["orders"][number]["items"]): string {
  return items
    .map((item) => `${item.name} ×${item.quantity} ${PRESENTATION_SHORT[item.presentation]}`)
    .join(", ");
}

const TAB_LABEL: Record<DayOrdersTab, string> = {
  ayer: "Pedidos de ayer",
  hoy: "Pedidos de hoy",
};

const TAB_HINT: Record<DayOrdersTab, string> = {
  ayer: "Montados ayer, se entregan hoy.",
  hoy: "Subidos hoy, se entregan el día siguiente.",
};

/**
 * Bloque "Gestión de hoy" del tablero: lo que hizo cada asesor, los pedidos
 * del día (realizados, entregados y devueltos), los listados de ayer y hoy, y
 * qué pulpas hay que producir.
 */
export function DailyBoard({
  rows,
  counters,
  tab,
  dayOrders,
  searchParams,
  priorities,
}: {
  rows: DailyRow[];
  counters: OrderCounters;
  tab: DayOrdersTab;
  dayOrders: DayOrders;
  searchParams: RawSearchParams;
  priorities: ProductionPriorityRow[];
}) {
  const page = Math.min(Math.max(1, Number(searchParams.page) || 1), dayOrders.totalPages);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Gestión de hoy</CardTitle>
          <Link href="/agenda" className="text-xs font-medium text-primary hover:underline">
            Ver agenda
          </Link>
        </CardHeader>
        {rows.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">No hay asesores activos.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Asesor</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Gestión
                    <span className="block text-[10px] font-normal normal-case">clientes por llamada o WhatsApp</span>
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Visitas</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Clientes nuevos</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{row.name}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.contacted}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.visitsDone}</td>
                    <td className="tabular px-3 py-2.5 text-right">{row.newClientsClosed}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatCOP(row.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <section aria-label="Pedidos de hoy" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pedidos realizados" value={counters.placed} />
        <StatCard label="Pedidos entregados" value={counters.delivered} />
        <StatCard label="Pedidos devueltos" value={counters.returned} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Últimos pedidos</CardTitle>
          <p className="text-xs text-muted-foreground">{TAB_HINT[tab]}</p>
        </CardHeader>

        <div role="tablist" aria-label="Pedidos por día" className="flex gap-1 border-b border-border px-4">
          {(["ayer", "hoy"] as const).map((key) => (
            <Link
              key={key}
              role="tab"
              aria-selected={key === tab}
              href={`/dashboard?tab=${key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                key === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[key]}
            </Link>
          ))}
        </div>

        {dayOrders.orders.length === 0 ? (
          <CardContent>
            <p className="pt-4 text-sm text-muted-foreground">No hay pedidos en este día.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Pedido</th>
                  <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>
                  <th scope="col" className="px-3 py-2 font-medium">Productos</th>
                  <th scope="col" className="px-3 py-2 font-medium">Domiciliario</th>
                  <th scope="col" className="px-3 py-2 font-medium">Asesor</th>
                  <th scope="col" className="px-5 py-2 font-medium">Localidad</th>
                </tr>
              </thead>
              <tbody>
                {dayOrders.orders.map((order) => (
                  <tr key={order.id} className="border-b border-border align-top last:border-0 hover:bg-muted">
                    <td className="px-5 py-2.5">
                      <Link href={`/pedidos/${order.id}`} className="tabular font-medium text-primary hover:underline">
                        {formatOrderNumber(order.orderNumber)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{order.client}</td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">{formatCOP(order.total)}</td>
                    <td className="max-w-64 px-3 py-2.5 text-muted-foreground">{describeItems(order.items)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{order.driver ?? "Sin asignar"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{order.seller ?? "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{order.locality ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          pathname="/dashboard"
          params={{ ...searchParams, tab }}
          page={page}
          totalPages={dayOrders.totalPages}
          total={dayOrders.total}
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prioridades de producción</CardTitle>
          <p className="text-xs text-muted-foreground">Pulpas que faltan o están por agotarse.</p>
        </CardHeader>
        {priorities.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Todos los sabores tienen stock suficiente.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Sabor</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cantidad (kg)</th>
                  <th scope="col" className="px-5 py-2 font-medium">Prioridad</th>
                </tr>
              </thead>
              <tbody>
                {priorities.map((row) => (
                  <tr key={row.productId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{row.flavor}</td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {row.physicalKg <= 0 ? "Sin stock" : `${Math.round(row.physicalKg * 10) / 10}`}
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge tone={row.priority === "ALTA" ? "danger" : "warning"}>
                        Prioridad {row.priority === "ALTA" ? "alta" : "media"}
                      </Badge>
                      <span className="ml-2 text-xs text-muted-foreground">{PRIORITY_REASON_LABEL[row.reason]}</span>
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
