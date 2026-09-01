import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { DISPATCH_ROLES, isAdmin, requireUser } from "@/server/guards";
import { listRoutes } from "@/server/services/routes";
import { routeListQuerySchema } from "@/server/validators/routes";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { ROUTE_STATUS_LABEL, ROUTE_STATUS_TONE, toOptions } from "@/lib/labels";

export const metadata: Metadata = { title: "Rutas" };

const statusOptions = toOptions(ROUTE_STATUS_LABEL);

export default async function RoutesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const canEdit = isAdmin(user) || DISPATCH_ROLES.includes(user.role as never);
  const query = routeListQuerySchema.parse(
    flattenSearchParams(await searchParams),
  );

  const routes = await listRoutes(query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rutas de despacho"
        description={`${routes.length} ${routes.length === 1 ? "ruta" : "rutas"}`}
        actions={
          canEdit && (
            <Link href="/rutas/nueva" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Nueva ruta
            </Link>
          )
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div>
            <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
              Estado
            </label>
            <Select id="status" name="status" defaultValue={query.status ?? ""} className="mt-1">
              <option value="">Todas</option>
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

        {routes.length === 0 ? (
          <EmptyState
            title="No hay rutas"
            description="Crea una ruta para agrupar los pedidos de un día de reparto."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Ruta</th>
                  <th scope="col" className="px-4 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-medium">Zona</th>
                  <th scope="col" className="px-4 py-2 font-medium">Repartidor</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr
                    key={route.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/rutas/${route.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {route.name}
                      </Link>
                      {route.vehicle && (
                        <p className="text-xs text-muted-foreground">
                          {route.vehicle}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(route.date)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {route.zone?.name ?? "Sin zona"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {route.driver?.name ?? "Sin asignar"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ROUTE_STATUS_TONE[route.status]}>
                        {ROUTE_STATUS_LABEL[route.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                      {route._count.orders}
                    </td>
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
