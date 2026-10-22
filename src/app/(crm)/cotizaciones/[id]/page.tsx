import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle, Printer } from "lucide-react";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { getQuote } from "@/server/services/quotes";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { QuoteStatusActions } from "@/components/quotes/quote-status-actions";
import {
  formatCOP,
  formatCalendarDate,
  formatDate,
  formatOrderNumber,
  formatQuantity,
} from "@/lib/format";
import {
  BILLING_MODE_LABEL,
  PRESENTATION_SHORT,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
} from "@/lib/labels";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Cotización" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const { id } = await params;

  const quote = await getQuote(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const code = quote.code;
  const clientName = quote.client.tradeName ?? quote.client.businessName;
  const contact = quote.client.contacts[0];

  // Texto listo para pegar en WhatsApp: así se envía la cotización hoy.
  const summary = [
    `*Cotización ${code}* — Dicampo`,
    `Cliente: ${clientName}`,
    "",
    ...quote.items.map(
      (item) =>
        `• ${item.productNameSnapshot} (${PRESENTATION_SHORT[item.presentationSnapshot]}) × ${formatQuantity(item.quantity)} a ${formatCOP(item.unitPrice)} = ${formatCOP(item.subtotal)}`,
    ),
    "",
    Number(quote.discount) > 0
      ? `Descuento${quote.discountLabel ? ` (${quote.discountLabel})` : ""}: −${formatCOP(quote.discount)}`
      : "",
    `Total: ${formatCOP(quote.total)}`,
    quote.validUntil ? `Válida hasta el ${formatCalendarDate(quote.validUntil)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const waLink = whatsappLink(
    contact?.whatsapp ?? contact?.phone ?? quote.client.phone,
    summary,
  );

  const canConvert =
    !quote.orderId && (quote.status === "BORRADOR" || quote.status === "ENVIADA");

  return (
    <div className="space-y-5">
      <PageHeader
        title={code}
        description={`${clientName} · ${formatDate(quote.quoteDate)}`}
        actions={
          <>
            <Link
              href={`/cotizaciones/${quote.id}/imprimir`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Printer aria-hidden="true" />
              PDF para el cliente
            </Link>
            {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              <MessageCircle aria-hidden="true" />
              Enviar por WhatsApp
            </a>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
                  {quote.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5">
                        <p className="font-medium text-foreground">{item.productNameSnapshot}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.skuSnapshot} · {PRESENTATION_SHORT[item.presentationSnapshot]}
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
                    <td className="tabular px-5 py-2 text-right">{formatCOP(quote.subtotal)}</td>
                  </tr>
                  {Number(quote.discount) > 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-2 text-right text-muted-foreground">
                        Descuento{quote.discountLabel ? ` · ${quote.discountLabel}` : ""}
                      </td>
                      <td className="tabular px-5 py-2 text-right text-destructive">
                        −{formatCOP(quote.discount)}
                      </td>
                    </tr>
                  )}
                  {Number(quote.tax) > 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-2 text-right text-muted-foreground">
                        IVA
                      </td>
                      <td className="tabular px-5 py-2 text-right">{formatCOP(quote.tax)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={4} className="px-5 py-3 text-right font-semibold">
                      Total
                    </td>
                    <td className="tabular px-5 py-3 text-right text-base font-semibold">
                      {formatCOP(quote.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
              <Badge tone={QUOTE_STATUS_TONE[quote.status]}>
                {QUOTE_STATUS_LABEL[quote.status]}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <QuoteStatusActions
                quoteId={quote.id}
                status={quote.status}
                canConvert={canConvert}
              />

              {quote.order && (
                <p className="text-sm">
                  Pedido:{" "}
                  <Link
                    href={`/pedidos/${quote.order.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatOrderNumber(quote.order.orderNumber)}
                  </Link>
                </p>
              )}

              {quote.rejectReason && (
                <p className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive">
                  Rechazada: {quote.rejectReason}
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
                    href={`/clientes/${quote.client.id}`}
                    className="text-primary hover:underline"
                  >
                    {clientName}
                  </Link>
                </DataRow>
                <DataRow label="Sede">{quote.address?.label ?? "Sin especificar"}</DataRow>
                <DataRow label="Asesor">
                  {quote.seller?.name ?? quote.legacySeller ?? "—"}
                </DataRow>
                <DataRow label="Lista de precios">{quote.priceListName ?? "—"}</DataRow>
                <DataRow label="Facturación">{BILLING_MODE_LABEL[quote.billingMode]}</DataRow>
                <DataRow label="Válida hasta">{formatCalendarDate(quote.validUntil)}</DataRow>
              </dl>

              {quote.notes && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {quote.notes}
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
