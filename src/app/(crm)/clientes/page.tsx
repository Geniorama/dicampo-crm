import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listClients } from "@/server/services/clients";
import { clientListQuerySchema } from "@/server/validators/clients";
import { PageHeader } from "@/components/layout/page-header";
import { ImportLink } from "@/components/import/import-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatClientCode, formatNit } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
  CLIENT_TYPE_LABEL,
  toOptions,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Clientes" };

const statusOptions = toOptions(CLIENT_STATUS_LABEL);
const typeOptions = toOptions(CLIENT_TYPE_LABEL);

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Los filtros viajan por la URL: la búsqueda queda compartible y el
  // listado se renderiza en el servidor, sin JavaScript de cliente.
  const query = clientListQuerySchema.parse(flattenSearchParams(params));
  const { items, total, page, totalPages } = await listClients(user, query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clientes"
        description={`${total} ${total === 1 ? "cliente" : "clientes"} en tu alcance`}
        actions={
          <>
            <ImportLink entity="clientes" user={user} />
            <Link href="/clientes/nuevo" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Nuevo cliente
            </Link>
          </>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Razón social, nombre comercial o NIT"
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

          <div>
            <label htmlFor="type" className="text-xs font-medium text-muted-foreground">
              Tipo
            </label>
            <Select id="type" name="type" defaultValue={query.type ?? ""} className="mt-1">
              <option value="">Todos</option>
              {typeOptions.map((option) => (
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
            title="No hay clientes que coincidan"
            description="Ajusta los filtros o registra un cliente nuevo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Código</th>
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">NIT</th>
                  <th scope="col" className="px-4 py-2 font-medium">Tipo</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 font-medium">Vendedor</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {items.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="tabular px-4 py-2.5 text-muted-foreground">
                      {formatClientCode(client.sequence)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/clientes/${client.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {client.tradeName ?? client.businessName}
                      </Link>
                      {client.tradeName && (
                        <p className="text-xs text-muted-foreground">
                          {client.businessName}
                        </p>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">
                      {formatNit(client.nit, client.nitDv)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {CLIENT_TYPE_LABEL[client.type]}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={CLIENT_STATUS_TONE[client.status]}>
                        {CLIENT_STATUS_LABEL[client.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {client.owner?.name ?? "Sin asignar"}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                      {client._count.orders}
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
function buildPageHref(
  params: RawSearchParams,
  page: number,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value === undefined) continue;
    search.set(key, Array.isArray(value) ? value[0] : value);
  }
  search.set("page", String(page));

  return `/clientes?${search.toString()}`;
}
