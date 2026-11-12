import Link from "next/link";
import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { getMyClientsFilterOptions, listMyClients } from "@/server/services/my-clients";
import { myClientsQuerySchema } from "@/server/validators/my-clients";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { ManagementSelect } from "@/components/my-clients/management-select";
import { formatCOP, formatDate } from "@/lib/format";
import { monthLabel, WEEKDAY_OPTIONS } from "@/lib/client-sales";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  CLIENT_RELATION_STATUS_LABEL,
  CLIENT_RELATION_STATUS_TONE,
  toOptions,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Mis clientes" };

const relationOptions = toOptions(CLIENT_RELATION_STATUS_LABEL);

function FilterSelect({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select id={name} name={name} defaultValue={value ?? ""} className="mt-1">
        {children}
      </Select>
    </div>
  );
}

export default async function MyClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const params = await searchParams;
  const query = myClientsQuerySchema.parse(flattenSearchParams(params));

  const [{ items, total, page, totalPages }, options] = await Promise.all([
    listMyClients(user, query),
    getMyClientsFilterOptions(user),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mis clientes"
        description={`${total} ${total === 1 ? "cliente" : "clientes"} en tu cartera`}
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

          {options.owners.length > 0 && (
            <FilterSelect name="ownerId" label="Asesor" value={query.ownerId}>
              <option value="">Todos</option>
              {options.owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </FilterSelect>
          )}

          <FilterSelect name="relationStatus" label="Estado del cliente" value={query.relationStatus}>
            <option value="">Todos</option>
            {relationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect name="locality" label="Localidad" value={query.locality}>
            <option value="">Todas</option>
            {options.localities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect name="zoneId" label="Zona / Ruta" value={query.zoneId}>
            <option value="">Todas</option>
            {options.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect name="orderDay" label="Día de pedido" value={query.orderDay}>
            <option value="">Cualquiera</option>
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect name="deliveryDay" label="Día de entrega" value={query.deliveryDay}>
            <option value="">Cualquiera</option>
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect name="lastOrderMonth" label="Mes del último pedido" value={query.lastOrderMonth}>
            <option value="">Todos</option>
            {options.months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </FilterSelect>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {items.length === 0 ? (
          <EmptyState
            title="No hay clientes que coincidan"
            description="Ajusta los filtros para ver más de tu cartera."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 font-medium">Localidad / Zona</th>
                  <th scope="col" className="px-4 py-2 font-medium">Pide / Entrega</th>
                  <th scope="col" className="px-4 py-2 font-medium">Último pedido</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Ticket prom.</th>
                  <th scope="col" className="px-4 py-2 font-medium">Gestión</th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Cotizar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((client) => {
                  const name = client.tradeName ?? client.businessName;
                  return (
                    <tr
                      key={client.id}
                      className="border-b border-border align-top last:border-0 hover:bg-muted"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/clientes/${client.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {name}
                        </Link>
                        {options.owners.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {client.owner?.name ?? "Sin asignar"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {client.relationStatus ? (
                          <Badge tone={CLIENT_RELATION_STATUS_TONE[client.relationStatus]}>
                            {CLIENT_RELATION_STATUS_LABEL[client.relationStatus]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {client.locality ?? "—"}
                        <p className="text-xs">{client.zone?.name ?? "Sin zona"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {client.orderDay ?? "—"}
                        <p className="text-xs">{client.deliveryDay ?? "—"}</p>
                      </td>
                      <td className="tabular px-4 py-2.5 text-muted-foreground">
                        {client.lastOrderAt ? formatDate(client.lastOrderAt) : "Sin pedidos"}
                        <p className="text-xs">{client.orderCount} pedidos</p>
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                        {client.orderCount > 0 ? formatCOP(client.avgTicket) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ManagementSelect
                          clientId={client.id}
                          clientName={name}
                          last={
                            client.lastManagement
                              ? {
                                  type: client.lastManagement.type,
                                  createdAt: client.lastManagement.createdAt.toISOString(),
                                }
                              : null
                          }
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/cotizaciones/nuevo?clientId=${client.id}&repetir=1`}
                          className={buttonVariants({ size: "sm" })}
                        >
                          <FileText aria-hidden="true" />
                          Cotizar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pathname="/mis-clientes" params={params} page={page} totalPages={totalPages} total={total} />
      </Card>
    </div>
  );
}
