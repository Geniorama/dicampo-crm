import Link from "next/link";
import type { Metadata } from "next";
import { Navigation } from "lucide-react";
import { DISPATCH_ROLES, requireUserPage } from "@/server/guards";
import { getDispatchDay } from "@/server/services/routes";
import { dispatchDayQuerySchema } from "@/server/validators/routes";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { DispatchNotesEditor } from "@/components/routes/dispatch-notes-editor";
import { buildPickList, groupByLocality, wazeLink, type DispatchOrder } from "@/lib/dispatch";
import { formatCOP, formatCalendarDate, formatOrderNumber, formatQuantity } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PRESENTATION_SHORT } from "@/lib/labels";
import type { Presentation } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Despacho del día" };

type View = "localidad" | "alistamiento";

export default async function DispatchDayPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUserPage(DISPATCH_ROLES);

  const raw = flattenSearchParams(await searchParams);
  const view: View = raw.vista === "alistamiento" ? "alistamiento" : "localidad";
  const parsed = dispatchDayQuerySchema.safeParse(raw);
  const { day, orders } = await getDispatchDay(parsed.success ? parsed.data.fecha : undefined);

  const dispatchOrders: DispatchOrder[] = orders;
  const groups = groupByLocality(dispatchOrders);
  const pickList = buildPickList(dispatchOrders);
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const withoutRoute = orders.filter((order) => !order.route).length;

  const tabHref = (next: View) => `/rutas/dia?fecha=${day}&vista=${next}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Despacho del día"
        description={`${formatCalendarDate(day)} · ${orders.length} ${orders.length === 1 ? "pedido" : "pedidos"} · ${formatCOP(total)}${withoutRoute > 0 ? ` · ${withoutRoute} sin ruta` : ""}`}
        actions={
          <Link
            href="/rutas"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver rutas
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <input type="hidden" name="vista" value={view} />
          <div>
            <label htmlFor="fecha" className="text-xs font-medium text-muted-foreground">
              Día de entrega
            </label>
            <Input id="fecha" name="fecha" type="date" defaultValue={day} className="mt-1" />
          </div>
          <Button type="submit" variant="secondary">
            Ver día
          </Button>

          <nav aria-label="Vista" className="ml-auto flex gap-1 text-sm">
            {(["localidad", "alistamiento"] as const).map((option) => (
              <Link
                key={option}
                href={tabHref(option)}
                aria-current={view === option ? "page" : undefined}
                className={
                  view === option
                    ? "rounded-md bg-primary-subtle px-3 py-1.5 font-medium text-primary-strong"
                    : "rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted"
                }
              >
                {option === "localidad" ? "Por localidad" : "Alistamiento por sabor"}
              </Link>
            ))}
          </nav>
        </form>
      </Card>

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay pedidos para ese día"
            description="Aquí aparecen los pedidos confirmados con esa fecha de entrega."
          />
        </Card>
      ) : view === "alistamiento" ? (
        <Card>
          <CardHeader>
            <CardTitle>Lo que hay que sacar de bodega</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-border">
            {pickList.map((line) => (
              <li key={`${line.name}|${line.presentation}`}>
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-muted">
                    <span className="font-medium text-foreground">{line.name}</span>
                    <span className="tabular text-base font-semibold text-foreground">
                      {formatQuantity(line.quantity)}{" "}
                      {PRESENTATION_SHORT[line.presentation as Presentation] ?? line.presentation}
                    </span>
                  </summary>
                  <ul className="space-y-1 bg-muted px-5 py-3 text-xs text-muted-foreground">
                    {line.orders.map((entry) => (
                      <li key={entry.orderNumber} className="flex justify-between gap-4">
                        <span>
                          {formatOrderNumber(entry.orderNumber)} · {entry.clientName}
                        </span>
                        <span className="tabular">{formatQuantity(entry.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.locality}>
            <CardHeader>
              <CardTitle>{group.locality}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {group.orderCount} {group.orderCount === 1 ? "pedido" : "pedidos"} ·{" "}
                {formatCOP(group.total)}
              </span>
            </CardHeader>
            <CardContent className="space-y-5">
              {group.neighborhoods.map((neighborhood) => (
                <section key={neighborhood.neighborhood} aria-label={neighborhood.neighborhood}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {neighborhood.neighborhood}
                  </h3>
                  <ul className="space-y-3">
                    {neighborhood.orders.map((dispatchOrder) => {
                      const order = orders.find((candidate) => candidate.id === dispatchOrder.id)!;
                      const waze = wazeLink(order.address);

                      return (
                        <li key={order.id} className="rounded-md border border-border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <Link
                                href={`/pedidos/${order.id}`}
                                className="tabular font-medium text-primary hover:underline"
                              >
                                {formatOrderNumber(order.orderNumber)}
                              </Link>{" "}
                              <span className="text-sm text-foreground">{order.clientName}</span>
                              <p className="text-xs text-muted-foreground">
                                {order.address ?? "Sin dirección"}
                                {order.phone ? ` · ${order.phone}` : ""}
                              </p>
                              {order.deliveryNotes && (
                                <p className="text-xs text-muted-foreground">
                                  Entrega: {order.deliveryNotes}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge tone={ORDER_STATUS_TONE[order.status]}>
                                {ORDER_STATUS_LABEL[order.status]}
                              </Badge>
                              {order.route ? (
                                <Link
                                  href={`/rutas/${order.route.id}`}
                                  className="text-xs text-primary hover:underline"
                                >
                                  {order.route.name}
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sin ruta</span>
                              )}
                              {waze && (
                                <a
                                  href={waze}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <Navigation className="size-3" aria-hidden="true" />
                                  Waze
                                </a>
                              )}
                            </div>
                          </div>

                          <p className="mt-2 text-xs text-muted-foreground">
                            {order.items
                              .map(
                                (item) =>
                                  `${item.name} ${formatQuantity(item.quantity)} ${PRESENTATION_SHORT[item.presentation as Presentation] ?? ""}`.trim(),
                              )
                              .join(" · ")}
                          </p>

                          <div className="mt-3">
                            <DispatchNotesEditor
                              orderId={order.id}
                              orderNumber={order.orderNumber}
                              collectionNote={order.collectionNote}
                              giftNote={order.giftNote}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
