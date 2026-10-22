import type { Metadata } from "next";
import { PURCHASING_ROLES, requireUserPage } from "@/server/guards";
import { ImportLink } from "@/components/import/import-link";
import { COMMON_FRUITS, listPurchases, summarizeByFruit } from "@/server/services/purchases";
import { todayInBogota } from "@/server/services/routes";
import { goalMonthQuerySchema } from "@/server/validators/goals";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { PurchaseForm } from "@/components/inventory/purchase-form";
import { currentMonth } from "@/lib/goals";
import { formatCOP, formatCalendarDate, formatQuantity } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Compras de fruta" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(PURCHASING_ROLES);

  const parsed = goalMonthQuerySchema.safeParse(flattenSearchParams(await searchParams));
  const month = (parsed.success && parsed.data.mes) || currentMonth();

  const purchases = await listPurchases(month);
  const summary = summarizeByFruit(purchases);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Costo de materia prima"
        description="Cada compra queda por separado, con su fecha, proveedor y precio. No mueve el inventario de pulpa."
        actions={<ImportLink entity="compras" user={user} />}
      />

      <PurchaseForm fruits={COMMON_FRUITS} today={todayInBogota()} />

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="mes" className="text-xs font-medium text-muted-foreground">
              Mes
            </label>
            <Input id="mes" name="mes" type="month" defaultValue={month} className="mt-1" />
          </div>
          <Button type="submit" variant="secondary">
            Ver mes
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resumen por fruta</CardTitle>
        </CardHeader>
        {summary.length === 0 ? (
          <EmptyState title="Sin compras en este mes" description="Registra la primera arriba." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Fruta</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Compras</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Kilos</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Costo total</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">$/kg prom.</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.fruit} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-foreground">{row.fruit}</td>
                    <td className="tabular px-5 py-2.5 text-right">{row.purchases}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatQuantity(row.kg)}</td>
                    <td className="tabular px-5 py-2.5 text-right font-medium">{formatCOP(row.cost)}</td>
                    <td className="tabular px-5 py-2.5 text-right">
                      {row.costPerKg === null ? "—" : formatCOP(Math.round(row.costPerKg))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compras del mes</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-5 py-2 font-medium">Fruta</th>
                  <th scope="col" className="px-5 py-2 font-medium">Proveedor</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Kilos</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Costo</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-muted-foreground">{formatCalendarDate(purchase.date)}</td>
                    <td className="px-5 py-2.5 text-foreground">{purchase.fruit}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{purchase.supplier}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatQuantity(purchase.kg)}</td>
                    <td className="tabular px-5 py-2.5 text-right font-medium">{formatCOP(purchase.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
