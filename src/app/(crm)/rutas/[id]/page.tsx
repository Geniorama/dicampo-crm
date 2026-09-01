import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { DISPATCH_ROLES, isAdmin, requireUser } from "@/server/guards";
import {
  getRoute,
  listAssignableOrders,
  nextRouteStatuses,
} from "@/server/services/routes";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  RoutePlanner,
  type PlannableOrder,
} from "@/components/routes/route-planner";
import { RouteStatusActions } from "@/components/routes/route-status-actions";
import { DeliveryForm } from "@/components/routes/delivery-form";
import {
  formatCOP,
  formatDate,
  formatDateTime,
  formatOrderNumber,
} from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ROUTE_STATUS_LABEL,
  ROUTE_STATUS_TONE,
} from "@/lib/labels";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Ruta" };

export default async function RouteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const route = await getRoute(id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const canEdit = isAdmin(user) || DISPATCH_ROLES.includes(user.role as never);
  const isPlanning = route.status === "PLANEADA";

  // Solo hace falta la bolsa de pedidos disponibles mientras se planea.
  const available =
    canEdit && isPlanning ? await listAssignableOrders(route.zoneId) : [];

  const toPlannable = (order: {
    id: string;
    orderNumber: number;
    total: unknown;
    requestedDeliveryDate: Date | null;
    client: { businessName: string; tradeName: string | null };
    address: {
      label: string;
      address: string;
      zone: { name: string } | null;
    } | null;
  }): PlannableOrder => ({
    id: order.id,
    orderNumber: order.orderNumber,
    total: Number(order.total),
    requestedDeliveryDate: order.requestedDeliveryDate?.toISOString() ?? null,
    clientName: order.client.tradeName ?? order.client.businessName,
    addressLabel: order.address?.label ?? null,
    addressText: order.address?.address ?? null,
    zoneName: order.address?.zone?.name ?? null,
  });

  const delivered = route.orders.filter((order) => order.status === "ENTREGADO");
  const total = route.orders.reduce((acc, order) => acc + Number(order.total), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={route.name}
        description={
          <>
            {formatDate(route.date)} · {route.zone?.name ?? "Sin zona"} ·{" "}
            {route.driver?.name ?? "Sin repartidor"}
          </>
        }
        actions={
          <Badge tone={ROUTE_STATUS_TONE[route.status]}>
            {ROUTE_STATUS_LABEL[route.status]}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Paradas
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-foreground">
            {route.orders.length}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Entregadas
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-foreground">
            {delivered.length} / {route.orders.length}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Valor despachado
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-foreground">
            {formatCOP(total)}
          </p>
        </Card>
      </div>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Estado de la ruta</CardTitle>
          </CardHeader>
          <CardContent>
            <RouteStatusActions
              routeId={route.id}
              status={route.status}
              available={nextRouteStatuses(route.status)}
            />
          </CardContent>
        </Card>
      )}

      {isPlanning ? (
        <RoutePlanner
          routeId={route.id}
          assigned={route.orders.map(toPlannable)}
          available={available.map(toPlannable)}
          editable={canEdit}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Paradas</CardTitle>
          </CardHeader>

          <ol className="divide-y divide-border">
            {route.orders.map((order) => {
              const waLink = whatsappLink(order.client.phone);

              return (
                <li key={order.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-strong">
                        {order.routeSequence ?? "—"}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/pedidos/${order.id}`}
                          className="tabular text-sm font-medium text-primary hover:underline"
                        >
                          {formatOrderNumber(order.orderNumber)}
                        </Link>
                        <p className="text-sm text-foreground">
                          {order.client.tradeName ?? order.client.businessName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {order.address
                            ? `${order.address.label} · ${order.address.address}`
                            : "Sin dirección"}
                        </p>
                        {order.address?.deliveryNotes && (
                          <p className="mt-1 text-xs text-warning">
                            {order.address.deliveryNotes}
                          </p>
                        )}
                        {order.proof && (
                          <p className="mt-1 text-xs text-success">
                            Recibió {order.proof.receivedBy}
                            {order.proof.receivedDoc
                              ? ` (${order.proof.receivedDoc})`
                              : ""}{" "}
                            · {formatDateTime(order.proof.deliveredAt)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                      <span className="tabular text-sm font-medium text-foreground">
                        {formatCOP(order.total)}
                      </span>
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          <MessageCircle aria-hidden="true" />
                          Avisar
                        </a>
                      )}
                    </div>
                  </div>

                  {canEdit && order.status === "DESPACHADO" && (
                    <DeliveryForm orderId={order.id} />
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
