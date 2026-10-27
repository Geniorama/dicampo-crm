import type { Metadata } from "next";
import { Gift, HandCoins, MapPin, Navigation } from "lucide-react";
import { DISPATCH_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { getDriverDay } from "@/server/services/routes";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DriverStopActions } from "@/components/routes/driver-stop";
import { StartRouteButton } from "@/components/routes/start-route-button";
import { googleMapsRoute, wazeLink } from "@/lib/dispatch";
import {
  formatBogotaTime,
  formatCalendarDate,
  formatCOP,
  formatOrderNumber,
} from "@/lib/format";
import { DELIVERY_FAIL_REASON_LABEL, ROUTE_STATUS_LABEL } from "@/lib/labels";
import { computeRouteTiming, formatDuration } from "@/lib/route-timing";

export const metadata: Metadata = { title: "Mi ruta" };

/** Pantalla pensada para el teléfono del repartidor: paradas en orden y un toque por acción. */
export default async function MyRoutePage() {
  const user = await requireUserPage(DISPATCH_ROLES);
  const routes = await getDriverDay(user);

  // Los intentos fallidos, para recordar por qué una parada ya no está en la lista.
  const attempts =
    routes.length === 0
      ? []
      : await prisma.deliveryAttempt.findMany({
          where: { routeId: { in: routes.map((route) => route.id) } },
          orderBy: { createdAt: "asc" },
          select: {
            routeId: true,
            reason: true,
            notes: true,
            order: {
              select: { client: { select: { businessName: true, tradeName: true } } },
            },
          },
        });

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Mi ruta" description="Tus entregas de hoy, en orden de visita." />

      {routes.length === 0 ? (
        <Card>
          <EmptyState
            title="No tienes rutas para hoy"
            description="Cuando despacho te asigne una ruta aparecerá aquí."
          />
        </Card>
      ) : (
        routes.map((route) => {
          const inProgress = route.status === "EN_RUTA";
          const done = route.orders.filter((order) => order.status === "ENTREGADO").length;
          const pendingOrders = route.orders.filter((order) => order.status !== "ENTREGADO");

          const timing = computeRouteTiming(
            route.startedAt,
            route.orders.map((order) => ({
              id: order.id,
              arrivedAt: order.arrivedAt,
              closedAt: order.deliveredAt,
            })),
            route.completedAt ?? new Date(),
          );
          const timingById = new Map(timing.stops.map((stop) => [stop.id, stop]));
          const fullRoute = inProgress
            ? googleMapsRoute(pendingOrders.map((order) => order.address?.address))
            : null;
          const routeAttempts = attempts.filter((attempt) => attempt.routeId === route.id);

          return (
            <Card key={route.id}>
              <CardHeader className="flex-wrap">
                <div>
                  <CardTitle>{route.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatCalendarDate(route.date)}
                    {route.vehicle ? ` · ${route.vehicle}` : ""}
                    {user.role !== "DESPACHO" && route.driver ? ` · ${route.driver.name}` : ""}
                  </p>
                </div>
                <Badge
                  tone={inProgress ? "primary" : route.status === "COMPLETADA" ? "success" : "neutral"}
                >
                  {ROUTE_STATUS_LABEL[route.status]}
                </Badge>
              </CardHeader>

              <CardContent className="space-y-4">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted px-2 py-2">
                    <dt className="text-xs text-muted-foreground">Entregadas</dt>
                    <dd className="tabular text-base font-semibold text-foreground">
                      {done} de {route.orders.length}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted px-2 py-2">
                    <dt className="text-xs text-muted-foreground">Salida</dt>
                    <dd className="tabular text-base font-semibold text-foreground">
                      {route.startedAt ? formatBogotaTime(route.startedAt) : "—"}
                    </dd>
                  </div>
                  <div className="rounded-md bg-muted px-2 py-2">
                    <dt className="text-xs text-muted-foreground">
                      {route.status === "COMPLETADA" ? "Duración" : "Recorrido"}
                    </dt>
                    <dd className="tabular text-base font-semibold text-foreground">
                      {route.startedAt ? formatDuration(timing.totalMs) : "—"}
                    </dd>
                  </div>
                </dl>

                {route.status === "PLANEADA" && route.orders.length > 0 && (
                  <StartRouteButton routeId={route.id} />
                )}

                {fullRoute && (
                  <a
                    href={fullRoute.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted"
                  >
                    <Navigation className="size-4" aria-hidden="true" />
                    Ver las paradas pendientes en Maps
                  </a>
                )}
                {fullRoute?.truncated && (
                  <p className="text-xs text-warning">
                    Maps admite 10 paradas por viaje: se muestran las primeras.
                  </p>
                )}

                <ol className="space-y-3">
                  {route.orders.map((order, index) => {
                    const delivered = order.status === "ENTREGADO";
                    const stopTiming = timingById.get(order.id);
                    const name = order.client.tradeName ?? order.client.businessName;
                    const address = order.address?.address ?? null;
                    const place = [order.address?.neighborhood, order.address?.locality]
                      .filter(Boolean)
                      .join(" · ");
                    const phone = order.client.phone?.replace(/[^\d+]/g, "");

                    return (
                      <li
                        key={order.id}
                        className={`space-y-3 rounded-lg border border-border p-3 ${
                          delivered ? "bg-muted/50" : "bg-card"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`tabular flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                              delivered
                                ? "bg-success-subtle text-success"
                                : "bg-primary text-primary-foreground"
                            }`}
                          >
                            {order.routeSequence ?? index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">{name}</p>
                            <p className="tabular text-xs text-muted-foreground">
                              Pedido {formatOrderNumber(order.orderNumber)} · {order._count.items}{" "}
                              {order._count.items === 1 ? "producto" : "productos"}
                            </p>
                            {address && (
                              <p className="mt-1 flex items-start gap-1 text-sm text-foreground">
                                <MapPin
                                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span>
                                  {address}
                                  {place && (
                                    <span className="block text-xs text-muted-foreground">{place}</span>
                                  )}
                                </span>
                              </p>
                            )}
                            {order.address?.deliveryNotes && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {order.address.deliveryNotes}
                              </p>
                            )}
                          </div>
                        </div>

                        {(order.collectionNote || order.giftNote) && (
                          <div className="space-y-1 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
                            {order.collectionNote && (
                              <p className="flex items-start gap-1.5">
                                <HandCoins className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {order.collectionNote}
                              </p>
                            )}
                            {order.giftNote && (
                              <p className="flex items-start gap-1.5">
                                <Gift className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {order.giftNote}
                              </p>
                            )}
                          </div>
                        )}

                        <p className="tabular flex justify-between text-sm">
                          <span className="text-muted-foreground">Total {formatCOP(order.total)}</span>
                          <span
                            className={order.balance > 0 ? "font-medium text-foreground" : "text-success"}
                          >
                            {order.balance > 0 ? `Por cobrar ${formatCOP(order.balance)}` : "Pagado"}
                          </span>
                        </p>

                        {delivered ? (
                          <div className="space-y-0.5 text-sm">
                            <p className="font-medium text-success">
                              Entregado
                              {order.deliveredAt ? ` a las ${formatBogotaTime(order.deliveredAt)}` : ""}
                              {order.proof?.receivedBy ? ` · recibió ${order.proof.receivedBy}` : ""}
                            </p>
                            <p className="tabular text-xs text-muted-foreground">
                              Trayecto {formatDuration(stopTiming?.travelMs ?? null)} · En sitio{" "}
                              {formatDuration(stopTiming?.onSiteMs ?? null)}
                            </p>
                            {order.proof?.notes && (
                              <p className="text-xs text-muted-foreground">
                                Observaciones: {order.proof.notes}
                              </p>
                            )}
                          </div>
                        ) : inProgress ? (
                          <>
                            {order.arrivedAt && (
                              <p className="text-xs text-muted-foreground">
                                Llegaste a las {formatBogotaTime(order.arrivedAt)}
                              </p>
                            )}
                            <DriverStopActions
                              orderId={order.id}
                              arrived={Boolean(order.arrivedAt)}
                              balance={order.balance}
                              links={{
                                maps: googleMapsRoute([address])?.url ?? null,
                                waze: wazeLink(address),
                                phone: phone ? `tel:${phone}` : null,
                              }}
                            />
                          </>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>

                {routeAttempts.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      No entregados en esta ruta
                    </p>
                    <ul className="space-y-1 text-sm">
                      {routeAttempts.map((attempt, index) => (
                        <li key={index} className="text-foreground">
                          {attempt.order.client.tradeName ?? attempt.order.client.businessName} ·{" "}
                          {DELIVERY_FAIL_REASON_LABEL[attempt.reason]}
                          {attempt.notes && (
                            <span className="text-muted-foreground"> — {attempt.notes}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
