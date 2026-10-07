import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getOrder } from "@/server/services/orders";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { OrderStatusActions } from "@/components/orders/order-status-actions";
import {
  formatCOP,
  formatCalendarDate, formatDate,
  formatDateTime,
  formatOrderNumber,
  formatQuantity,
} from "@/lib/format";
import {
  ORDER_CHANNEL_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  PAYMENT_TERMS_LABEL,
  PRESENTATION_SHORT,
  STOCK_MOVEMENT_LABEL,
} from "@/lib/labels";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const order = await getOrder(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const clientName = order.client.tradeName ?? order.client.businessName;
  const contact = order.client.contacts[0];

  // Resumen del pedido listo para pegar en WhatsApp: es como Dicampo
  // confirma con el cliente.
  const summary = [
    `*Pedido ${formatOrderNumber(order.orderNumber)}* — Dicampo`,
    `Cliente: ${clientName}`,
    "",
    ...order.items.map(
      (item) =>
        `• ${item.productNameSnapshot} (${PRESENTATION_SHORT[item.presentationSnapshot]}) × ${formatQuantity(item.quantity)} = ${formatCOP(item.subtotal)}`,
    ),
    "",
    `Total: ${formatCOP(order.total)}`,
    order.requestedDeliveryDate
      ? `Entrega: ${formatCalendarDate(order.requestedDeliveryDate)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const waLink = whatsappLink(
    contact?.whatsapp ?? contact?.phone ?? order.client.phone,
    summary,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={formatOrderNumber(order.orderNumber)}
        description={`${clientName} · ${formatDate(order.orderDate)}`}
        actions={
          waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              <MessageCircle aria-hidden="true" />
              Enviar por WhatsApp
            </a>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Productos</CardTitle>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium">Producto</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Cantidad</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Precio</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Desc.</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-foreground">
                          {item.productNameSnapshot}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.skuSnapshot} ·{" "}
                          {PRESENTATION_SHORT[item.presentationSnapshot]}
                        </p>
                      </td>
                      <td className="tabular px-5 py-2.5 text-right">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-muted-foreground">
                        {formatCOP(item.unitPrice)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right text-muted-foreground">
                        {Number(item.discount) > 0 ? `−${formatCOP(item.discount)}` : "—"}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right font-medium text-foreground">
                        {formatCOP(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr>
                    <td colSpan={4} className="px-5 py-2 text-right text-muted-foreground">
                      Subtotal
                    </td>
                    <td className="tabular px-5 py-2 text-right">
                      {formatCOP(order.subtotal)}
                    </td>
                  </tr>
                  {Number(order.discount) > 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-2 text-right text-muted-foreground">
                        Descuentos
                      </td>
                      <td className="tabular px-5 py-2 text-right text-destructive">
                        −{formatCOP(order.discount)}
                      </td>
                    </tr>
                  )}
                  {Number(order.tax) > 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-2 text-right text-muted-foreground">
                        IVA
                      </td>
                      <td className="tabular px-5 py-2 text-right">
                        {formatCOP(order.tax)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right font-semibold">
                      Total
                    </td>
                    <td className="tabular px-5 py-3 text-right text-base font-semibold">
                      {formatCOP(order.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {order.movements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Movimientos de inventario</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {order.movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-medium text-foreground">
                        {STOCK_MOVEMENT_LABEL[movement.type]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {movement.lot
                          ? `Lote ${movement.lot.lotCode} · vence ${formatCalendarDate(movement.lot.expiryDate)}`
                          : "Sin lote"}{" "}
                        · {formatDateTime(movement.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`tabular font-medium ${
                        Number(movement.quantity) < 0
                          ? "text-destructive"
                          : "text-success"
                      }`}
                    >
                      {Number(movement.quantity) > 0 ? "+" : ""}
                      {formatQuantity(movement.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
              <Badge tone={ORDER_STATUS_TONE[order.status]}>
                {ORDER_STATUS_LABEL[order.status]}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <OrderStatusActions orderId={order.id} status={order.status} />

              {order.cancelReason && (
                <p className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive">
                  Cancelado: {order.cancelReason}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <DataRow label="Cliente">
                  <Link
                    href={`/clientes/${order.client.id}`}
                    className="text-primary hover:underline"
                  >
                    {clientName}
                  </Link>
                </DataRow>
                <DataRow label="Sede">
                  {order.address
                    ? `${order.address.label}${order.address.zone ? ` (${order.address.zone.name})` : ""}`
                    : "Sin especificar"}
                </DataRow>
                <DataRow label="Dirección">
                  {order.address?.address ?? "—"}
                </DataRow>
                <DataRow label="Vendedor">{order.seller?.name ?? "—"}</DataRow>
                <DataRow label="Canal">
                  {ORDER_CHANNEL_LABEL[order.channel]}
                </DataRow>
                <DataRow label="Entrega solicitada">
                  {formatCalendarDate(order.requestedDeliveryDate)}
                </DataRow>
                <DataRow label="Condición de pago">
                  {PAYMENT_TERMS_LABEL[order.paymentTerms]}
                </DataRow>
                <DataRow label="Estado de pago">
                  <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]}>
                    {PAYMENT_STATUS_LABEL[order.paymentStatus]}
                  </Badge>
                </DataRow>
                <DataRow label="Ruta">
                  {order.route
                    ? `${order.route.name} · ${formatCalendarDate(order.route.date)}`
                    : "Sin asignar"}
                </DataRow>
              </dl>

              {order.notes && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {order.notes}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
