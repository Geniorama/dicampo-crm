import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { getInventoryPanel } from "@/server/services/inventory-panel";
import { goalMonthQuerySchema } from "@/server/validators/goals";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { currentMonth } from "@/lib/goals";
import { formatCOP, formatQuantity } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import type { ReorderStatus, YieldFlag } from "@/lib/production";

export const metadata: Metadata = { title: "Panel de inventario" };

const REORDER_LABEL: Record<ReorderStatus, string> = {
  PRODUCIR_YA: "Producir ya",
  PRONTO: "Pronto",
  SANO: "Sano",
  SIN_VENTAS: "Sin ventas",
};
const REORDER_TONE: Record<ReorderStatus, BadgeTone> = {
  PRODUCIR_YA: "danger",
  PRONTO: "warning",
  SANO: "success",
  SIN_VENTAS: "neutral",
};
const YIELD_LABEL: Record<YieldFlag, string> = {
  NORMAL: "Normal",
  REVISAR: "Revisar",
  SIN_DATO: "Sin esperado",
};
const YIELD_TONE: Record<YieldFlag, BadgeTone> = {
  NORMAL: "success",
  REVISAR: "danger",
  SIN_DATO: "neutral",
};

/** Margen: verde desde 45 %, ámbar desde 25 %, rojo por debajo. */
function marginTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 45) return "text-success";
  if (pct >= 25) return "text-warning";
  return "text-destructive";
}

export default async function InventoryPanelPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdminPage();

  const parsed = goalMonthQuerySchema.safeParse(flattenSearchParams(await searchParams));
  const month = (parsed.success && parsed.data.mes) || currentMonth();
  const panel = await getInventoryPanel(month);

  const maxSold = Math.max(1, ...panel.topSellers.map((row) => row.kg));
  const uncosted = panel.profitability.filter((row) => row.cost === null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Panel de inventario"
        description="De la fruta comprada a lo vendido: rendimiento, rentabilidad y cuándo producir."
      />

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

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fruta comprada" value={`${formatQuantity(panel.purchases.kg)} kg`} hint={formatCOP(panel.purchases.cost)} />
        <StatCard
          label="Pulpa producida"
          value={`${formatQuantity(panel.production.pulpKg)} kg`}
          hint={`${formatQuantity(panel.production.publicKg)} pública · ${formatQuantity(panel.production.bulkKg)} granel`}
        />
        <StatCard label="Stock pública" value={`${formatQuantity(panel.publicStockKg)} kg`} hint="Disponible hoy" />
        <StatCard
          label="Rendimiento"
          value={panel.production.fruitKg > 0 ? `${panel.production.yieldPct}%` : "—"}
          hint="Pulpa sobre fruta recibida"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Dónde se queda la plata: de la fruta a lo vendido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {panel.funnel.fruitKg === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tandas registradas en este mes.</p>
          ) : (
            <>
              {[
                { label: "Fruta recibida", kg: panel.funnel.fruitKg, pct: 100, color: "bg-[#ec6928]" },
                { label: "Pulpa", kg: panel.funnel.pulpKg, pct: panel.funnel.pulpPct, color: "bg-primary" },
                { label: "Vendido", kg: panel.funnel.soldKg, pct: Math.min(panel.funnel.soldPct, 100), color: "bg-primary-strong" },
              ].map((step) => (
                <div key={step.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-foreground">{step.label}</span>
                    <span className="tabular text-muted-foreground">
                      {formatQuantity(step.kg)} kg · {step.pct}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted">
                    <div className={`h-3 rounded-full ${step.color}`} style={{ width: `${step.pct}%` }} />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                De cada 100 kg de fruta, {panel.funnel.soldPct} se vendieron como pulpa. Lo que se pierde al
                despulpar es en parte normal; lo que importa es que no suba de lo esperado.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Salidas de pulpa</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Line label="Vendido" value={`${formatQuantity(panel.outflows.soldKg)} kg`} />
              <Line label="Muestras entregadas" value={`${formatQuantity(panel.outflows.sampleKg)} kg`} tone="text-warning" />
              <Line label="Devoluciones (reingresaron)" value={`${formatQuantity(panel.outflows.returnedSellableKg)} kg`} tone="text-success" />
              <Line label="Devoluciones (dañadas, perdidas)" value={`${formatQuantity(panel.outflows.returnedDamagedKg)} kg`} tone="text-destructive" />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Muestras y devoluciones solo mueven stock: no entran al margen, pero explican por qué salió pulpa
              que no fue venta.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qué pulpa se vende más</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {panel.topSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas en este mes.</p>
            ) : (
              panel.topSellers.map((row) => (
                <div key={row.name} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-3 text-sm">
                  <span className="truncate text-foreground">{row.name}</span>
                  <div className="h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 rounded-full bg-primary" style={{ width: `${(row.kg / maxSold) * 100}%` }} />
                  </div>
                  <span className="tabular text-right text-muted-foreground">{formatQuantity(row.kg)} kg</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rentabilidad: costo de la fruta vs ventas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Costo materia prima" value={formatCOP(panel.totals.cost)} />
            <StatCard label="Ventas" value={formatCOP(panel.totals.sales)} />
            <StatCard label="Utilidad bruta" value={formatCOP(panel.totals.profit)} />
            <StatCard
              label="Rentabilidad"
              value={panel.totals.marginPct === null ? "—" : `${panel.totals.marginPct}%`}
            />
          </div>

          {panel.profitability.length === 0 ? (
            <EmptyState title="Sin ventas en este mes" description="La rentabilidad aparece con el primer pedido vendido." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Producto</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Kg vendidos</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">$/kg costo</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Costo MP</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Venta</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Utilidad</th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">Rent.</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.profitability.map((row) => (
                    <tr key={row.productId} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4 text-foreground">{row.name}</td>
                      <td className="tabular px-4 py-2.5 text-right">{formatQuantity(row.soldKg)}</td>
                      <td className="tabular px-4 py-2.5 text-right">
                        {row.unitCost === null ? "—" : formatCOP(Math.round(row.unitCost))}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right">{row.cost === null ? "—" : formatCOP(row.cost)}</td>
                      <td className="tabular px-4 py-2.5 text-right">{formatCOP(row.sales)}</td>
                      <td className={`tabular px-4 py-2.5 text-right font-semibold ${marginTone(row.marginPct)}`}>
                        {row.profit === null ? "—" : formatCOP(row.profit)}
                      </td>
                      <td className={`tabular py-2.5 pl-4 text-right font-semibold ${marginTone(row.marginPct)}`}>
                        {row.marginPct === null ? "—" : `${row.marginPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {uncosted.length > 0 && (
            <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
              Sin costo, y por eso fuera de los totales: {uncosted.map((row) => row.name).join(", ")}. Hace falta
              registrar compras de su fruta y tandas de producción.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            El costo de un kilo de pulpa sale de las tandas (fruta usada × costo de la fruta ÷ pulpa obtenida,
            últimos 120 días); el costo de lo vendido es ese valor por los kilos vendidos. La rentabilidad es la
            utilidad sobre la venta.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cuándo producir · días de stock</CardTitle>
          </CardHeader>
          {panel.reorder.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">Sin existencias ni ventas recientes.</p>
            </CardContent>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium">Producto</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Stock</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Venta/día</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Días</th>
                    <th scope="col" className="px-5 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.reorder.map((row) => (
                    <tr key={row.productId} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 text-foreground">{row.name}</td>
                      <td className="tabular px-3 py-2.5 text-right">{formatQuantity(row.stockKg)} kg</td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {row.soldPerDayKg > 0 ? `${row.soldPerDayKg.toFixed(1)} kg` : "—"}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">{row.days ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={REORDER_TONE[row.status]}>{REORDER_LABEL[row.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 pb-4 pt-2 text-xs text-muted-foreground">
            Ritmo de venta: promedio de los últimos 30 días.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rendimiento por fruta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {panel.yields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tandas en este mes.</p>
            ) : (
              panel.yields.map((row) => (
                <div key={row.productId}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{row.name}</span>
                    <Badge tone={YIELD_TONE[row.flag]}>{YIELD_LABEL[row.flag]}</Badge>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-muted">
                    <div
                      className={`h-2 rounded-full ${row.flag === "REVISAR" ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${Math.min(row.actualPct, 100)}%` }}
                    />
                  </div>
                  <p className="tabular mt-1 text-xs text-muted-foreground">
                    {row.actualPct}%
                    {row.expectedPct !== null &&
                      ` · esperado ${row.expectedPct}% · ${row.actualPct - row.expectedPct >= 0 ? "+" : ""}${row.actualPct - row.expectedPct} pts`}
                  </p>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              El rendimiento esperado se define en cada producto del catálogo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular font-medium ${tone ?? "text-foreground"}`}>{value}</dd>
    </div>
  );
}
