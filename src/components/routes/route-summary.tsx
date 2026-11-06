import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { formatOrderNumber } from "@/lib/format";
import {
  NO_PAYMENT_LABEL,
  PAYMENT_METHOD_LABEL,
  STOP_STATUS_LABEL,
  STOP_STATUS_TONE,
  type StopStatus,
} from "@/lib/labels";
import { estimateRouteMinutes, formatMinutes } from "@/lib/route-timing";
import type { getDriverDay } from "@/server/services/routes";
import type { DeliveryFailReason } from "@/generated/prisma/enums";
import { DELIVERY_FAIL_REASON_LABEL } from "@/lib/labels";

type DriverRoutes = Awaited<ReturnType<typeof getDriverDay>>;

/** Intento de entrega fallido de una ruta: la parada aparece como "Devuelto". */
export type ReturnedStop = {
  routeId: string | null;
  reason: DeliveryFailReason;
  notes: string | null;
  order: {
    id: string;
    orderNumber: number;
    client: {
      businessName: string;
      tradeName: string | null;
      contacts: { firstName: string; lastName: string | null }[];
    };
    address: {
      address: string;
      neighborhood: string | null;
      locality: string | null;
      zone: { name: string } | null;
    } | null;
  };
};

type Row = {
  key: string;
  zone: string | null;
  locality: string | null;
  client: string;
  route: string;
  orderId: string;
  orderNumber: number;
  neighborhood: string | null;
  contact: string | null;
  address: string | null;
  notes: string | null;
  status: StopStatus;
  payment: string;
};

const fullName = (contact?: { firstName: string; lastName: string | null }) =>
  contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null;

function buildRows(routes: DriverRoutes, returned: ReturnedStop[]): Row[] {
  const rows: Row[] = [];

  for (const route of routes) {
    for (const order of route.orders) {
      rows.push({
        key: order.id,
        zone: order.address?.zone?.name ?? null,
        locality: order.address?.locality ?? null,
        client: order.client.tradeName ?? order.client.businessName,
        route: route.name,
        orderId: order.id,
        orderNumber: order.orderNumber,
        neighborhood: order.address?.neighborhood ?? null,
        contact: fullName(order.client.contacts[0]),
        address: order.address?.address ?? null,
        notes:
          [order.collectionNote, order.giftNote, order.proof?.notes, order.address?.deliveryNotes]
            .filter(Boolean)
            .join(" · ") || null,
        // Al asignarlo a una ruta el pedido queda "En ruta" hasta que se cierre.
        status: order.status === "ENTREGADO" ? "ENTREGADO" : "EN_RUTA",
        payment: order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : NO_PAYMENT_LABEL,
      });
    }

    for (const attempt of returned.filter((item) => item.routeId === route.id)) {
      rows.push({
        key: `${attempt.order.id}-${attempt.reason}`,
        zone: attempt.order.address?.zone?.name ?? null,
        locality: attempt.order.address?.locality ?? null,
        client: attempt.order.client.tradeName ?? attempt.order.client.businessName,
        route: route.name,
        orderId: attempt.order.id,
        orderNumber: attempt.order.orderNumber,
        neighborhood: attempt.order.address?.neighborhood ?? null,
        contact: fullName(attempt.order.client.contacts[0]),
        address: attempt.order.address?.address ?? null,
        notes: [DELIVERY_FAIL_REASON_LABEL[attempt.reason], attempt.notes].filter(Boolean).join(" — "),
        status: "DEVUELTO",
        payment: NO_PAYMENT_LABEL,
      });
    }
  }

  return rows;
}

/**
 * Resumen de las rutas del domiciliario: cuatro tarjetas y la tabla con una
 * fila por parada. Debajo van las tarjetas de cada parada, que son las que
 * permiten entregar.
 */
export function RouteSummary({ routes, returned }: { routes: DriverRoutes; returned: ReturnedStop[] }) {
  const rows = buildRows(routes, returned);
  const pending = rows.filter((row) => row.status === "EN_RUTA");
  const localities = [...new Set(pending.map((row) => row.locality).filter(Boolean))] as string[];
  const routeNames = [...new Set(routes.filter((route) => route.orders.length > 0).map((route) => route.name))];

  return (
    <div className="space-y-5">
      <section aria-label="Resumen de la ruta" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos a entregar" value={pending.length} hint={`${rows.length} en total`} />
        <StatCard
          label="Ruta asignada"
          value={routeNames.length === 0 ? "—" : routeNames.length === 1 ? routeNames[0] : `${routeNames.length} rutas`}
          hint={routeNames.length > 1 ? routeNames.join(" · ") : undefined}
        />
        <StatCard
          label="Localidades"
          value={localities.length}
          hint={localities.length > 0 ? localities.join(" · ") : "Sin paradas pendientes"}
        />
        <StatCard
          label="Tiempo aproximado"
          value={formatMinutes(estimateRouteMinutes(pending.length))}
          hint="Estimado por número de paradas"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Paradas del día</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">No hay paradas asignadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Zona</th>
                  <th scope="col" className="px-3 py-2 font-medium">Localidad</th>
                  <th scope="col" className="px-3 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ruta</th>
                  <th scope="col" className="px-3 py-2 font-medium">Pedido</th>
                  <th scope="col" className="px-3 py-2 font-medium">Barrio</th>
                  <th scope="col" className="px-3 py-2 font-medium">Persona de contacto</th>
                  <th scope="col" className="px-3 py-2 font-medium">Dirección</th>
                  <th scope="col" className="px-3 py-2 font-medium">Observaciones</th>
                  <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 font-medium">Tipo de pago</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground">{row.zone ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.locality ?? "—"}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{row.client}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.route}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/pedidos/${row.orderId}`} className="tabular text-primary hover:underline">
                        {formatOrderNumber(row.orderNumber)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.neighborhood ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.contact ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.address ?? "—"}</td>
                    <td className="max-w-56 px-3 py-2.5 text-muted-foreground">{row.notes ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={STOP_STATUS_TONE[row.status]}>{STOP_STATUS_LABEL[row.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.payment}</td>
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
