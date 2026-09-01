import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { requireUser, INVENTORY_ROLES, isAdmin } from "@/server/guards";
import { getStockSummary, listLots } from "@/server/services/inventory";
import { lotListQuerySchema } from "@/server/validators/inventory";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { LotAdjustment } from "@/components/inventory/lot-adjustment";
import { ExpireLotsButton } from "@/components/inventory/expire-lots-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatQuantity } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  LOT_STATUS_LABEL,
  LOT_STATUS_TONE,
  PRESENTATION_SHORT,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Inventario" };

/** Umbral de alerta para producto congelado próximo a vencer. */
const EXPIRY_WARNING_DAYS = 30;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  // Bodega y administración operan el inventario; el resto solo consulta.
  const canEdit = isAdmin(user) || INVENTORY_ROLES.includes(user.role as never);
  const params = await searchParams;
  const query = lotListQuerySchema.parse(flattenSearchParams(params));

  const [stock, lots] = await Promise.all([
    getStockSummary(),
    listLots(query),
  ]);

  const withStock = stock.filter((item) => item.available > 0);
  const outOfStock = stock.filter((item) => item.available === 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description={`${withStock.length} de ${stock.length} presentaciones con existencias`}
        actions={
          canEdit && (
            <>
              <ExpireLotsButton />
              <Link href="/inventario/lotes/nuevo" className={buttonVariants()}>
                <Plus aria-hidden="true" />
                Registrar producción
              </Link>
            </>
          )
        }
      />

      {outOfStock.length > 0 && (
        <p
          role="status"
          className="rounded-md bg-warning-subtle px-4 py-3 text-sm text-warning"
        >
          Sin existencias:{" "}
          {outOfStock
            .map(
              (item) =>
                `${item.product.name} (${PRESENTATION_SHORT[item.presentation]})`,
            )
            .join(", ")}
          .
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Existencias por presentación</CardTitle>
        </CardHeader>

        {stock.length === 0 ? (
          <EmptyState
            title="No hay productos en el catálogo"
            description="Ejecuta `npm run db:seed` para cargar los sabores."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                  <th scope="col" className="px-4 py-2 font-medium">Presentación</th>
                  <th scope="col" className="px-4 py-2 font-medium">SKU</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0 hover:bg-muted"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/inventario/kardex/${item.id}`}
                        className="font-medium text-primary hover:underline"
                        title="Ver kardex"
                      >
                        {item.product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {PRESENTATION_SHORT[item.presentation]}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {item.sku}
                    </td>
                    <td
                      className={`tabular px-4 py-2.5 text-right font-medium ${
                        item.available === 0
                          ? "text-destructive"
                          : "text-foreground"
                      }`}
                    >
                      {formatQuantity(item.available)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lotes</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ordenados por vencimiento: es el orden en que se despachan (FEFO)
          </p>
        </CardHeader>

        {lots.items.length === 0 ? (
          <EmptyState
            title="No hay lotes registrados"
            description="Registra una entrada de producción para empezar a controlar el inventario."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Lote</th>
                  <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                  <th scope="col" className="px-4 py-2 font-medium">Producción</th>
                  <th scope="col" className="px-4 py-2 font-medium">Vencimiento</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Saldo</th>
                  {canEdit && (
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {lots.items.map((lot) => {
                  const daysLeft = differenceInCalendarDays(
                    lot.expiryDate,
                    new Date(),
                  );
                  const isExpiringSoon =
                    daysLeft >= 0 &&
                    daysLeft <= EXPIRY_WARNING_DAYS &&
                    Number(lot.quantityAvailable) > 0;

                  return (
                    <tr
                      key={lot.id}
                      className="border-b border-border last:border-0 hover:bg-muted"
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {lot.lotCode}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {lot.variant.product.name} (
                        {PRESENTATION_SHORT[lot.variant.presentation]})
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDate(lot.productionDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            daysLeft < 0
                              ? "text-destructive"
                              : isExpiringSoon
                                ? "text-warning"
                                : "text-muted-foreground"
                          }
                        >
                          {formatDate(lot.expiryDate)}
                        </span>
                        {isExpiringSoon && (
                          <span className="ml-2 text-xs text-warning">
                            {daysLeft === 0
                              ? "vence hoy"
                              : `en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={LOT_STATUS_TONE[lot.status]}>
                          {LOT_STATUS_LABEL[lot.status]}
                        </Badge>
                      </td>
                      <td className="tabular px-4 py-2.5 text-right font-medium text-foreground">
                        {formatQuantity(lot.quantityAvailable)}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          / {formatQuantity(lot.quantityInitial)}
                        </span>
                      </td>

                      {canEdit && (
                        <td className="px-4 py-2.5 text-right">
                          <LotAdjustment
                            lotId={lot.id}
                            lotCode={lot.lotCode}
                            available={Number(lot.quantityAvailable)}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
