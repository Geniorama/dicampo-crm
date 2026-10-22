import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { listQuotes } from "@/server/services/quotes";
import { quoteListQuerySchema } from "@/server/validators/quotes";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatCOP, formatCalendarDate, formatDate } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, toOptions } from "@/lib/labels";

export const metadata: Metadata = { title: "Cotizaciones" };

const statusOptions = toOptions(QUOTE_STATUS_LABEL);

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const params = await searchParams;
  const query = quoteListQuerySchema.parse(flattenSearchParams(params));

  const { items, total, page, totalPages } = await listQuotes(user, query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cotizaciones"
        description={`${total} ${total === 1 ? "cotización" : "cotizaciones"}`}
        actions={
          <Link href="/cotizaciones/nuevo" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva cotización
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
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
            <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
              Estado
            </label>
            <Select id="status" name="status" defaultValue={query.status ?? ""} className="mt-1">
              <option value="">Todos</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {items.length === 0 ? (
          <EmptyState
            title="No hay cotizaciones que coincidan"
            description="Ajusta los filtros o crea una cotización nueva."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Cotización</th>
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-medium">Vigencia</th>
                  <th scope="col" className="px-4 py-2 font-medium">Asesor</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((quote) => (
                  <tr
                    key={quote.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/cotizaciones/${quote.id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {quote.code}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {quote._count.items}{" "}
                        {quote._count.items === 1 ? "producto" : "productos"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {quote.client.tradeName ?? quote.client.businessName}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(quote.quoteDate)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatCalendarDate(quote.validUntil)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {quote.seller?.name ?? quote.legacySeller ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={QUOTE_STATUS_TONE[quote.status]}>
                        {QUOTE_STATUS_LABEL[quote.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-medium text-foreground">
                      {formatCOP(quote.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Paginación"
            className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
          >
            <p className="text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildPageHref(params, page - 1)}
                  className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted"
                >
                  Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildPageHref(params, page + 1)}
                  className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted"
                >
                  Siguiente
                </Link>
              )}
            </div>
          </nav>
        )}
      </Card>
    </div>
  );
}

/** Conserva los filtros activos al cambiar de página. */
function buildPageHref(params: RawSearchParams, page: number): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    search.set(key, Array.isArray(value) ? value[0] : value);
  }
  search.set("page", String(page));

  return `/cotizaciones?${search.toString()}`;
}
