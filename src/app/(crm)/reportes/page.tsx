import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileSpreadsheet } from "lucide-react";
import { isAdmin, requireUser } from "@/server/guards";
import {
  getInventoryTurnover,
  getRepurchaseAlerts,
  getSalesByProduct,
  getSalesBySeller,
  getSalesSummary,
  getSalesTrend,
} from "@/server/services/analytics";
import {
  PERIOD_PRESETS,
  reportQuerySchema,
} from "@/server/validators/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { TrendChart } from "@/components/reports/trend-chart";
import { formatCOP, formatDate, formatQuantity } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { PRESENTATION_SHORT } from "@/lib/labels";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Reportes" };

const periodOptions = Object.entries(PERIOD_PRESETS);

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const params = flattenSearchParams(await searchParams);
  const query = reportQuerySchema.parse(params);

  const [summary, trend, bySeller, byProduct, repurchase, turnover] =
    await Promise.all([
      getSalesSummary(user, query),
      getSalesTrend(user, query),
      getSalesBySeller(user, query),
      getSalesByProduct(user, query),
      getRepurchaseAlerts(user, query),
      getInventoryTurnover(query),
    ]);

  /** Conserva el período elegido en los enlaces de descarga. */
  const exportHref = (tipo: string) => {
    const search = new URLSearchParams({ tipo, period: query.period });
    if (query.period === "PERSONALIZADO") {
      if (params.from) search.set("from", params.from);
      if (params.to) search.set("to", params.to);
    }
    if (tipo === "recompra") search.set("inactiveDays", String(query.inactiveDays));
    return `/api/reportes/exportar?${search.toString()}`;
  };

  const topProducts = byProduct.slice(0, 10);
  const maxProductRevenue = topProducts[0]?.revenue ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reportes"
        description={`${formatDate(query.rangeFrom)} — ${formatDate(query.rangeTo)}`}
        actions={
          <Link
            href={`/reportes/exportar?${new URLSearchParams({ period: query.period }).toString()}`}
            className={buttonVariants()}
          >
            <FileSpreadsheet aria-hidden="true" />
            Exportar a Excel
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="period" className="text-xs font-medium text-muted-foreground">
              Período
            </label>
            <Select id="period" name="period" defaultValue={query.period} className="mt-1">
              {periodOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={params.from ?? isoDate(query.rangeFrom)}
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              Hasta
            </label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={params.to ?? isoDate(query.rangeTo)}
              className="mt-1"
            />
          </div>

          <div>
            <label
              htmlFor="inactiveDays"
              className="text-xs font-medium text-muted-foreground"
            >
              Alerta de recompra
            </label>
            <Select
              id="inactiveDays"
              name="inactiveDays"
              defaultValue={String(query.inactiveDays)}
              className="mt-1"
            >
              <option value="15">15 días sin comprar</option>
              <option value="30">30 días sin comprar</option>
              <option value="60">60 días sin comprar</option>
              <option value="90">90 días sin comprar</option>
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Aplicar
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Las fechas solo se usan con el período «Personalizado».
          </p>
        </form>
      </Card>

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas" value={formatCOP(summary.revenue)} />
        <StatCard label="Pedidos" value={summary.orderCount} />
        <StatCard
          label="Ticket promedio"
          value={formatCOP(summary.averageTicket)}
        />
        <StatCard
          label="Clientes que compraron"
          value={summary.clientCount}
          hint="Distintos en el período"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Evolución de ventas</CardTitle>
          <ExportLink href={exportHref("ventas")} />
        </CardHeader>
        <TrendChart points={trend.points} granularity={trend.granularity} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Productos más vendidos</CardTitle>
            <ExportLink href={exportHref("productos")} />
          </CardHeader>

          {topProducts.length === 0 ? (
            <EmptyState title="Sin ventas en el período" />
          ) : (
            <ul className="divide-y divide-border">
              {topProducts.map((row) => (
                <li key={row.variantId} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm text-foreground">
                      {row.productName}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {row.presentation
                          ? PRESENTATION_SHORT[row.presentation]
                          : ""}
                      </span>
                    </p>
                    <span className="tabular shrink-0 text-sm font-medium text-foreground">
                      {formatCOP(row.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-green"
                        style={{
                          width: `${maxProductRevenue > 0 ? (row.revenue / maxProductRevenue) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {formatQuantity(row.quantity)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventas por vendedor</CardTitle>
            <ExportLink href={exportHref("vendedores")} />
          </CardHeader>

          {bySeller.length === 0 ? (
            <EmptyState title="Sin ventas en el período" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium">Vendedor</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Pedidos</th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {bySeller.map((row) => (
                    <tr
                      key={row.sellerId ?? "sin-vendedor"}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-2.5 text-foreground">{row.name}</td>
                      <td className="tabular px-5 py-2.5 text-right text-muted-foreground">
                        {row.orders}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right font-medium text-foreground">
                        {formatCOP(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Clientes sin comprar hace {query.inactiveDays} días ({repurchase.length})
          </CardTitle>
          <ExportLink href={exportHref("recompra")} />
        </CardHeader>

        {repurchase.length === 0 ? (
          <EmptyState
            title="Ningún cliente activo está callado"
            description="Todos han comprado dentro del plazo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-5 py-2 font-medium">Vendedor</th>
                  <th scope="col" className="px-5 py-2 font-medium">Último pedido</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Sin comprar</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {repurchase.map((row) => {
                  const waLink = whatsappLink(row.phone);

                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/clientes/${row.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {row.owner}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {row.lastOrderDate ? formatDate(row.lastOrderDate) : "Nunca"}
                      </td>
                      <td
                        className={`tabular px-5 py-2.5 text-right font-medium ${
                          row.daysSince === null ? "text-destructive" : "text-warning"
                        }`}
                      >
                        {row.daysSince === null
                          ? "Nunca ha comprado"
                          : `${row.daysSince} días`}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin teléfono</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAdmin(user) && (
        <Card>
          <CardHeader>
            <CardTitle>Rotación de inventario</CardTitle>
            <ExportLink href={exportHref("inventario")} />
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Producto</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Vendido</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Saldo</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {turnover.map((row) => (
                  <tr key={row.variantId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-foreground">
                      {row.productName}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {row.presentation ? PRESENTATION_SHORT[row.presentation] : ""}
                      </span>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right text-muted-foreground">
                      {formatQuantity(row.sold)}
                    </td>
                    <td
                      className={`tabular px-5 py-2.5 text-right ${
                        row.stock === 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {formatQuantity(row.stock)}
                    </td>
                    <td
                      className={`tabular px-5 py-2.5 text-right ${
                        row.coverageDays !== null && row.coverageDays < 7
                          ? "text-warning"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.coverageDays === null
                        ? "Sin ventas"
                        : `${row.coverageDays} días`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-5 py-3 text-xs text-muted-foreground">
            La cobertura estima cuántos días dura el saldo actual al ritmo de
            venta del período.
          </p>
        </Card>
      )}
    </div>
  );
}

/** Enlace de descarga. Es un <a> nativo: la respuesta es un archivo, no JSON. */
function ExportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      <Download className="size-3.5" aria-hidden="true" />
      CSV
    </a>
  );
}
