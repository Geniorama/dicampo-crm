import Link from "next/link";
import type { Metadata } from "next";
import { INVENTORY_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { listBatches } from "@/server/services/production";
import { todayInBogota } from "@/server/services/routes";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductionForm } from "@/components/inventory/production-form";
import { formatCalendarDate, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Producción" };

export default async function ProductionPage() {
  await requireUserPage(INVENTORY_ROLES);

  const [products, batches] = await Promise.all([
    prisma.product.findMany({
      where: { active: true, variants: { some: { presentation: "KILO", active: true } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, expectedYieldPct: true },
    }),
    listBatches(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Producción"
        description="Fruta recibida y cómo se repartió. La pulpa pública queda lista para vender, con su lote."
        actions={
          <Link href="/inventario" className="text-sm font-medium text-primary hover:underline">
            Ver inventario
          </Link>
        }
      />

      <ProductionForm products={products} today={todayInBogota()} />

      <Card>
        <CardHeader>
          <CardTitle>Tandas recientes</CardTitle>
        </CardHeader>

        {batches.length === 0 ? (
          <EmptyState title="Aún no hay tandas" description="Registra la primera arriba." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-5 py-2 font-medium">Producto</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Fruta</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Pública</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Granel</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Desperdicio</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Rend.</th>
                  <th scope="col" className="px-5 py-2 font-medium">Lote</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 text-muted-foreground">{formatCalendarDate(batch.date)}</td>
                    <td className="px-5 py-2.5 text-foreground">{batch.productName}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatQuantity(batch.fruitKg)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatQuantity(batch.publicKg)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatQuantity(batch.bulkKg)}</td>
                    <td className="tabular px-5 py-2.5 text-right text-destructive">
                      {formatQuantity(batch.wasteKg)}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">{batch.yieldPct}%</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{batch.lot?.lotCode ?? "—"}</td>
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
