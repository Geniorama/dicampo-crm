import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listOrders } from "@/server/services/orders";
import { orderListQuerySchema } from "@/server/validators/orders";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatCOP, formatCalendarDate, formatDate, formatOrderNumber } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  ORDER_CHANNEL_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  toOptions,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Pedidos" };

const statusOptions = toOptions(ORDER_STATUS_LABEL);
const paymentStatusOptions = toOptions(PAYMENT_STATUS_LABEL);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = orderListQuerySchema.parse(flattenSearchParams(params));

  const { items, total, page, totalPages } = await listOrders(user, query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pedidos"
        description={`${total} ${total === 1 ? "pedido" : "pedidos"}`}
        actions={
          <Link href="/pedidos/nuevo" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nuevo pedido
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

          <div>
            <label htmlFor="paymentStatus" className="text-xs font-medium text-muted-foreground">
              Pago
            </label>
            <Select
              id="paymentStatus"
              name="paymentStatus"
              defaultValue={query.paymentStatus ?? ""}
              className="mt-1"
            >
              <option value="">Todos</option>
              {paymentStatusOptions.map((option) => (
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
            title="No hay pedidos que coincidan"
            description="Ajusta los filtros o registra un pedido nuevo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Pedido</th>
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-2 font-medium">Entrega</th>
                  <th scope="col" className="px-4 py-2 font-medium">Canal</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 font-medium">Pago</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/pedidos/${order.id}`}
                        className="tabular font-medium text-primary hover:underline"
                      >
                        {formatOrderNumber(order.orderNumber)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {order._count.items}{" "}
                        {order._count.items === 1 ? "producto" : "productos"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {order.client.tradeName ?? order.client.businessName}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(order.orderDate)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatCalendarDate(order.requestedDeliveryDate)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {ORDER_CHANNEL_LABEL[order.channel]}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]}>
                        {PAYMENT_STATUS_LABEL[order.paymentStatus]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-medium text-foreground">
                      {formatCOP(order.total)}
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

  return `/pedidos?${search.toString()}`;
}
