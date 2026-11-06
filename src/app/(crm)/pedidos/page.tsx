import Link from "next/link";
import type { Metadata } from "next";
import { requireUserPage, ORDER_ROLES } from "@/server/guards";
import { groupByZone, listOrderBoard, sumByFlavor, type OrderBoardRow } from "@/server/services/order-board";
import { orderBoardQuerySchema } from "@/server/validators/order-board";
import { PageHeader } from "@/components/layout/page-header";
import { DispatchNoteCell } from "@/components/orders/dispatch-note-cell";
import { Pagination } from "@/components/ui/pagination";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatCalendarDate, formatOrderNumber } from "@/lib/format";
import { DELIVERY_ZONES, DELIVERY_ZONE_LABEL } from "@/lib/delivery-zones";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  DISPATCH_STATE_LABEL,
  DISPATCH_STATE_TONE,
  NO_DISPATCH_LABEL,
  PRESENTATION_SHORT,
  PRODUCTION_STATE_LABEL,
  PRODUCTION_STATE_TONE,
  ACCOUNTING_LABEL,
  ACCOUNTING_TONE,
  toOptions,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Presentation } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Pedidos" };

const accountingOptions = toOptions(ACCOUNTING_LABEL);

const VIEWS = [
  { key: "lista", label: "Lista" },
  { key: "pulpa", label: "Agrupar por pulpa" },
  { key: "zona", label: "Agrupar por zona / ruta" },
] as const;

function OrderRows({ rows }: { rows: OrderBoardRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">Pedido</th>
            <th scope="col" className="px-3 py-2 font-medium">Dirección</th>
            <th scope="col" className="px-3 py-2 font-medium">Zona</th>
            <th scope="col" className="px-3 py-2 font-medium">Localidad</th>
            <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
            <th scope="col" className="px-3 py-2 font-medium">Barrio</th>
            <th scope="col" className="px-3 py-2 font-medium">Ruta</th>
            <th scope="col" className="px-3 py-2 font-medium">Fecha de entrega</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado contable</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado producción</th>
            <th scope="col" className="px-3 py-2 font-medium">Estado despachos</th>
            <th scope="col" className="px-4 py-2 font-medium">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.orderId} className="border-b border-border align-top last:border-0 hover:bg-muted">
              <td className="px-4 py-2.5">
                <Link href={`/pedidos/${row.orderId}`} className="tabular font-medium text-primary hover:underline">
                  {formatOrderNumber(row.orderNumber)}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.quoteId ? (
                    <Link href={`/cotizaciones/${row.quoteId}`} className="hover:underline">
                      {row.quoteCode}
                    </Link>
                  ) : (
                    "Sin cotización"
                  )}
                </p>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.address ?? "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.zone ? DELIVERY_ZONE_LABEL[row.zone] : "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.locality ?? "—"}</td>
              <td className="px-3 py-2.5 font-medium text-foreground">{row.client}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.neighborhood ?? "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.route ?? "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{formatCalendarDate(row.deliveryDate)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={ACCOUNTING_TONE[row.accounting]}>{ACCOUNTING_LABEL[row.accounting]}</Badge>
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={PRODUCTION_STATE_TONE[row.production]}>{PRODUCTION_STATE_LABEL[row.production]}</Badge>
              </td>
              <td className="px-3 py-2.5">
                {row.dispatch ? (
                  <Badge tone={DISPATCH_STATE_TONE[row.dispatch]}>{DISPATCH_STATE_LABEL[row.dispatch]}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{NO_DISPATCH_LABEL}</span>
                )}
              </td>
              <td className="max-w-56 px-4 py-2.5">
                <DispatchNoteCell orderId={row.orderId} note={row.note} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(ORDER_ROLES);
  const params = await searchParams;
  const query = orderBoardQuerySchema.parse(flattenSearchParams(params));

  const { rows, total, page, totalPages, truncated } = await listOrderBoard(user, query);

  // Los enlaces de vista conservan los filtros pero reinician la página.
  const keep = new URLSearchParams();
  for (const [key, value] of Object.entries(flattenSearchParams(params))) {
    if (value && key !== "view" && key !== "page") keep.set(key, String(value));
  }
  const viewHref = (view: string) => {
    const next = new URLSearchParams(keep);
    if (view !== "lista") next.set("view", view);
    const qs = next.toString();
    return qs ? `/pedidos?${qs}` : "/pedidos";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pedidos"
        description={`${total} ${total === 1 ? "pedido" : "pedidos"} · nacen de las cotizaciones; un administrador también puede crear uno directo`}
        actions={
          user.role === "ADMIN" ? (
            <Link href="/pedidos/nuevo" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Nuevo pedido
            </Link>
          ) : undefined
        }
      />

      <Card>
        <div role="tablist" aria-label="Vista de pedidos" className="flex flex-wrap gap-1 border-b border-border px-4">
          {VIEWS.map((view) => (
            <Link
              key={view.key}
              role="tab"
              aria-selected={view.key === query.view}
              href={viewHref(view.key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                view.key === query.view
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {view.label}
            </Link>
          ))}
        </div>

        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          {query.view !== "lista" && <input type="hidden" name="view" value={query.view} />}

          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar cliente
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Razón social o nombre comercial"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="accounting" className="text-xs font-medium text-muted-foreground">
              Estado contable
            </label>
            <Select id="accounting" name="accounting" defaultValue={query.accounting ?? ""} className="mt-1">
              <option value="">Todos</option>
              {accountingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="zone" className="text-xs font-medium text-muted-foreground">
              Zona
            </label>
            <Select id="zone" name="zone" defaultValue={query.zone ?? ""} className="mt-1">
              <option value="">Todas</option>
              {DELIVERY_ZONES.map((zone) => (
                <option key={zone.key} value={zone.key}>
                  {zone.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="day" className="text-xs font-medium text-muted-foreground">
              Fecha de entrega
            </label>
            <Input
              id="day"
              name="day"
              type="date"
              defaultValue={typeof params.day === "string" ? params.day : ""}
              className="mt-1"
            />
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            title="No hay pedidos que coincidan"
            description="Los pedidos aparecen cuando un asesor guarda una cotización."
          />
        ) : query.view === "lista" ? (
          <>
            <OrderRows rows={rows} />
            <Pagination pathname="/pedidos" params={params} page={page} totalPages={totalPages} total={total} />
          </>
        ) : query.view === "pulpa" ? (
          <div className="overflow-x-auto">
            <p className="px-5 pt-4 text-xs text-muted-foreground">
              Suma lo que falta por entregar en {rows.length} {rows.length === 1 ? "pedido" : "pedidos"}.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Pulpa</th>
                  <th scope="col" className="px-3 py-2 font-medium">Presentación</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {sumByFlavor(rows).map((row) => (
                  <tr key={`${row.name}-${row.presentation}`} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-foreground">{row.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {PRESENTATION_SHORT[row.presentation as Presentation]}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right font-semibold">
                      {row.quantity.toLocaleString("es-CO", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right text-muted-foreground">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            {groupByZone(rows).map((group) => (
              <section key={group.zone ?? "sin-zona"} aria-label={group.zone ? DELIVERY_ZONE_LABEL[group.zone] : "Sin zona"}>
                <CardHeader>
                  <CardTitle>{group.zone ? DELIVERY_ZONE_LABEL[group.zone] : "Sin zona"}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {group.count} {group.count === 1 ? "pedido" : "pedidos"}
                  </p>
                </CardHeader>
                {group.routes.map((route) => (
                  <div key={route.name}>
                    <p className="bg-muted px-5 py-1.5 text-xs font-medium text-muted-foreground">
                      Ruta: {route.name} · {route.rows.length}
                    </p>
                    <OrderRows rows={route.rows} />
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

        {truncated && (
          <p className="px-5 pb-4 text-xs text-warning">
            Se muestran los primeros 500 pedidos: filtra por fecha de entrega o zona para ver el resto.
          </p>
        )}
      </Card>
    </div>
  );
}
