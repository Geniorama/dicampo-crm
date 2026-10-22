import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { getQuote } from "@/server/services/quotes";
import { NotFoundError } from "@/server/errors";
import { Logo } from "@/components/layout/logo";
import { PrintButton } from "@/components/quotes/print-button";
import { buttonVariants } from "@/components/ui/button";
import { formatCOP, formatCalendarDate, formatDate, formatNit } from "@/lib/format";
import { BILLING_MODE_LABEL, PRESENTATION_SHORT } from "@/lib/labels";
import { toKilos } from "@/lib/production";
import { DEFAULT_QUOTE_VALIDITY_DAYS, MIN_ORDER_KG, PORTIONS_PER_KG } from "@/lib/quote-rules";

export const metadata: Metadata = { title: "Cotización para el cliente" };

/** Datos legales que salen en el PDF que recibe el cliente. */
const COMPANY = {
  name: "D'CAMPO FRUTAS S.A.S.",
  nit: "901.310.236",
  address: "CRA 81G #45-69",
  city: "Bogotá",
};

/**
 * Hoja de la cotización para el cliente, con el formato del PDF del cotizador
 * en Apps Script. Se imprime o se guarda como PDF desde el navegador: así no
 * hay un servicio más que mantener, y el menú lateral se oculta al imprimir.
 */
export default async function PrintQuotePage({
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

  const contact = quote.client.contacts[0];
  const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : "";

  // Una libra son medio kilo: las porciones del PDF se cuentan sobre kilos. Los
  // zumos se venden por litros: salen con su cantidad y sin porciones.
  const lines = quote.items.map((item) => {
    const quantity = Number(item.quantity);
    const kilos = toKilos(quantity, item.presentationSnapshot);
    return {
      id: item.id,
      name: item.productNameSnapshot,
      kilos,
      isPulp: item.presentationSnapshot === "KILO" || item.presentationSnapshot === "LIBRA",
      shown: `${quantity.toLocaleString("es-CO")} ${PRESENTATION_SHORT[item.presentationSnapshot]}`,
      gross: Math.round(quantity * Number(item.unitPrice)),
    };
  });
  const totalKilos = lines.reduce((sum, line) => sum + line.kilos, 0);
  const hasDiscount = Number(quote.discount) > 0;
  const fmt = (value: number) => value.toLocaleString("es-CO");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/cotizaciones/${quote.id}`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Volver
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-5 rounded-lg border border-border bg-card p-8 text-sm text-foreground print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6">
          <div>
            <Logo height={44} />
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{COMPANY.name}</span>
              <br />
              Nit: {COMPANY.nit}
              <br />
              {COMPANY.address}
              <br />
              {COMPANY.city}
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-bold tracking-wide">COTIZACIÓN COMERCIAL</h1>
            <p className="tabular text-base font-semibold text-primary-strong">{quote.code}</p>
          </div>
        </header>

        <div className="h-1 rounded bg-[#ec6928]" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Pulpa de fruta natural congelada · Bogotá · pago contra entrega
        </p>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Datos del cliente
            </h2>
            <dl className="space-y-1">
              <Row label="Cliente">{quote.client.tradeName ?? quote.client.businessName}</Row>
              {quote.address && quote.address.label !== "Sede principal" && (
                <Row label="Sede">{quote.address.label}</Row>
              )}
              <Row label="NIT / CC">{formatNit(quote.client.nit, quote.client.nitDv)}</Row>
              <Row label="Contacto">{contactName || "—"}</Row>
              <Row label="Teléfono">{contact?.phone ?? contact?.whatsapp ?? quote.client.phone ?? "—"}</Row>
              <Row label="Dirección">{quote.address?.address ?? "—"}</Row>
              <Row label="Ciudad">{quote.address?.city ?? "Bogotá"}</Row>
            </dl>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Datos de la cotización
            </h2>
            <dl className="space-y-1">
              <Row label="Fecha">{formatDate(quote.quoteDate)}</Row>
              <Row label="Asesor">{quote.seller?.name ?? quote.legacySeller ?? "—"}</Row>
              <Row label="Tipo">{quote.priceListName ?? "—"}</Row>
              <Row label="Facturación">{BILLING_MODE_LABEL[quote.billingMode]}</Row>
              <Row label="Válida hasta">{formatCalendarDate(quote.validUntil)}</Row>
            </dl>
          </div>
        </section>

        <table className="w-full">
          <thead>
            <tr className="bg-primary text-left text-xs text-primary-foreground">
              <th scope="col" className="w-10 px-3 py-2 text-center font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Sabor</th>
              <th scope="col" className="px-3 py-2 text-center font-medium">Kilos</th>
              <th scope="col" className="px-3 py-2 text-center font-medium">Porciones (125 g)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id} className="border-b border-border">
                <td className="px-3 py-2 text-center">{index + 1}</td>
                <td className="px-3 py-2">{line.name}</td>
                <td className="tabular px-3 py-2 text-center">{line.isPulp ? fmt(line.kilos) : line.shown}</td>
                <td className="tabular px-3 py-2 text-center">{line.isPulp ? fmt(line.kilos * PORTIONS_PER_KG) : "—"}</td>
                <td className="tabular px-3 py-2 text-right">{formatCOP(line.gross)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {hasDiscount && (
              <>
                <tr className="bg-muted font-semibold text-muted-foreground">
                  <td colSpan={2} className="px-3 py-2 text-right">Subtotal</td>
                  <td className="tabular px-3 py-2 text-center">{fmt(totalKilos)}</td>
                  <td className="tabular px-3 py-2 text-center">{fmt(totalKilos * PORTIONS_PER_KG)}</td>
                  <td className="tabular px-3 py-2 text-right">{formatCOP(quote.subtotal)}</td>
                </tr>
                <tr className="bg-primary-subtle font-semibold text-primary-strong">
                  <td colSpan={4} className="px-3 py-2 text-right">
                    Descuento — {quote.discountLabel ?? "Descuento"} ({fmt(Number(quote.discountPercent))}%)
                  </td>
                  <td className="tabular px-3 py-2 text-right">−{formatCOP(quote.discount)}</td>
                </tr>
              </>
            )}
            <tr className="font-bold">
              <td colSpan={2} className="px-3 py-3 text-right">TOTAL</td>
              <td className="tabular px-3 py-3 text-center">{fmt(totalKilos)}</td>
              <td className="tabular px-3 py-3 text-center">{fmt(totalKilos * PORTIONS_PER_KG)}</td>
              <td className="tabular px-3 py-3 text-right text-base">{formatCOP(quote.total)}</td>
            </tr>
          </tfoot>
        </table>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Condiciones comerciales
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Precios en pesos colombianos (COP), IVA incluido.</li>
            <li>
              Pedido mínimo: {MIN_ORDER_KG} kilos (1 paquete = {PORTIONS_PER_KG} porciones de 125 g).
            </li>
            <li>Domicilio gratis en Bogotá. Pago contra entrega.</li>
            <li>
              Forma de facturación: <strong>{BILLING_MODE_LABEL[quote.billingMode]}</strong>.
            </li>
            <li>Validez: {DEFAULT_QUOTE_VALIDITY_DAYS} días calendario desde la fecha de emisión.</li>
            <li>
              Producto: pulpa de fruta natural congelada, 100% fruta, sin conservantes ni colorantes.
            </li>
            {quote.notes && (
              <li>
                <strong>Observaciones:</strong> {quote.notes}
              </li>
            )}
          </ul>
        </section>

        <footer className="grid gap-8 pt-8 sm:grid-cols-2">
          <div className="border-t border-foreground pt-2 text-xs">
            <p className="font-medium">{quote.seller?.name ?? quote.legacySeller ?? ""}</p>
            <p className="text-muted-foreground">Asesor comercial · {COMPANY.name}</p>
          </div>
          <div className="border-t border-foreground pt-2 text-xs">
            <p className="font-medium">Aceptación del cliente</p>
            <p className="text-muted-foreground">Firma y fecha</p>
          </div>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
