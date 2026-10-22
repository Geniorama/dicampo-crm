import { prisma } from "../db";
import { LotStatus, StockMovementType } from "@/generated/prisma/enums";
import { monthBounds } from "@/lib/goals";
import {
  batchBreakdown,
  daysOfStock,
  funnel,
  margin,
  toKilos,
  yieldFlag,
} from "@/lib/production";
import { SOLD_STATUSES } from "./analytics";

/**
 * Panel de inventario y rentabilidad (administración).
 *
 * Responde tres preguntas: ¿cuánto de la fruta que compro termina vendido?
 * (embudo y rendimiento), ¿cuánto gano por sabor? (costo de la fruta contra
 * ventas) y ¿cuándo toca producir? (días de stock al ritmo de venta).
 *
 * El costo de un kilo de pulpa sale de las tandas: fruta usada × costo de la
 * fruta, entre los kilos de pulpa que dieron. El costo de lo vendido es ese
 * costo por los kilos vendidos; así dos sabores que comparten fruta no se
 * cargan el mismo costo dos veces.
 */

/** Cuánto se mira atrás para costear un kilo de pulpa. */
const COST_WINDOW_DAYS = 120;
const SALES_RATE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getInventoryPanel(month: string, now: Date = new Date()) {
  const { start, end } = monthBounds(month);
  const inMonth = { gte: start, lt: end };
  // Las fechas de calendario (compras, tandas) están a medianoche UTC.
  const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const dayEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const costFrom = new Date(dayEnd.getTime() - COST_WINDOW_DAYS * DAY_MS);
  const rateFrom = new Date(now.getTime() - SALES_RATE_DAYS * DAY_MS);

  const [purchases, monthBatches, costBatches, soldItems, recentItems, movements, lots, products] =
    await Promise.all([
      prisma.fruitPurchase.aggregate({
        where: { date: { gte: dayStart, lt: dayEnd } },
        _sum: { kg: true, cost: true },
      }),
      prisma.productionBatch.findMany({
        where: { date: { gte: dayStart, lt: dayEnd } },
        select: { productId: true, fruitKg: true, publicKg: true, bulkKg: true },
      }),
      prisma.productionBatch.findMany({
        where: { date: { gte: costFrom, lt: dayEnd }, fruitCost: { not: null } },
        select: { productId: true, fruitCost: true, publicKg: true, bulkKg: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { status: { in: SOLD_STATUSES }, orderDate: inMonth } },
        select: { variant: { select: { productId: true } }, quantity: true, presentationSnapshot: true, subtotal: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { status: { in: SOLD_STATUSES }, orderDate: { gte: rateFrom } } },
        select: { variant: { select: { productId: true } }, quantity: true, presentationSnapshot: true },
      }),
      prisma.stockMovement.groupBy({
        by: ["type"],
        where: {
          createdAt: inMonth,
          // Sin pedido: la devolución que genera una cancelación no es de un cliente.
          orderId: null,
          type: {
            in: [
              StockMovementType.MUESTRA,
              StockMovementType.DEVOLUCION,
              StockMovementType.DEVOLUCION_DANADA,
            ],
          },
        },
        _sum: { quantity: true },
      }),
      prisma.lot.findMany({
        where: { status: LotStatus.DISPONIBLE, quantityAvailable: { gt: 0 } },
        select: { quantityAvailable: true, variant: { select: { productId: true, presentation: true } } },
      }),
      prisma.product.findMany({
        where: { active: true },
        select: { id: true, name: true, flavor: true, expectedYieldPct: true },
      }),
    ]);

  const productName = new Map(products.map((product) => [product.id, product.name]));
  const num = (value: unknown) => Number(value ?? 0);

  // ── Producción del mes ─────────────────────────────────────
  const fruitKg = monthBatches.reduce((sum, batch) => sum + num(batch.fruitKg), 0);
  const publicKg = monthBatches.reduce((sum, batch) => sum + num(batch.publicKg), 0);
  const bulkKg = monthBatches.reduce((sum, batch) => sum + num(batch.bulkKg), 0);
  const pulpKg = publicKg + bulkKg;

  // ── Ventas por producto (mes) ──────────────────────────────
  const soldByProduct = new Map<string, { kg: number; sales: number }>();
  for (const item of soldItems) {
    const entry = soldByProduct.get(item.variant.productId) ?? { kg: 0, sales: 0 };
    entry.kg += toKilos(num(item.quantity), item.presentationSnapshot);
    entry.sales += num(item.subtotal);
    soldByProduct.set(item.variant.productId, entry);
  }
  const soldKg = [...soldByProduct.values()].reduce((sum, entry) => sum + entry.kg, 0);

  // ── Costo por kilo de pulpa, por producto ──────────────────
  const costByProduct = new Map<string, { cost: number; kg: number }>();
  for (const batch of costBatches) {
    const entry = costByProduct.get(batch.productId) ?? { cost: 0, kg: 0 };
    entry.cost += num(batch.fruitCost);
    entry.kg += num(batch.publicKg) + num(batch.bulkKg);
    costByProduct.set(batch.productId, entry);
  }

  const profitability = [...soldByProduct.entries()]
    .map(([productId, sold]) => {
      const unit = costByProduct.get(productId);
      const unitCost = unit && unit.kg > 0 ? unit.cost / unit.kg : null;
      const result = unitCost === null ? null : margin(sold.sales, Math.round(unitCost * sold.kg));

      return {
        productId,
        name: productName.get(productId) ?? "Producto",
        soldKg: sold.kg,
        sales: sold.sales,
        unitCost,
        cost: result?.cost ?? null,
        profit: result?.profit ?? null,
        marginPct: result?.marginPct ?? null,
      };
    })
    .sort((a, b) => b.sales - a.sales);

  const costed = profitability.filter((row) => row.cost !== null);
  const totals = margin(
    costed.reduce((sum, row) => sum + row.sales, 0),
    costed.reduce((sum, row) => sum + (row.cost ?? 0), 0),
  );

  // ── Rendimiento por producto vs esperado ───────────────────
  const yieldByProduct = new Map<string, { fruit: number; pulp: number }>();
  for (const batch of monthBatches) {
    const entry = yieldByProduct.get(batch.productId) ?? { fruit: 0, pulp: 0 };
    entry.fruit += num(batch.fruitKg);
    entry.pulp += num(batch.publicKg) + num(batch.bulkKg);
    yieldByProduct.set(batch.productId, entry);
  }
  const expectedById = new Map(products.map((product) => [product.id, product.expectedYieldPct]));

  const yields = [...yieldByProduct.entries()]
    .map(([productId, entry]) => {
      const actual = batchBreakdown(entry.fruit, entry.pulp, 0).yieldPct;
      const expected = expectedById.get(productId) ?? null;
      return {
        productId,
        name: productName.get(productId) ?? "Producto",
        actualPct: actual,
        expectedPct: expected,
        flag: yieldFlag(actual, expected),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // ── Stock y días de stock ──────────────────────────────────
  const stockByProduct = new Map<string, number>();
  for (const lot of lots) {
    stockByProduct.set(
      lot.variant.productId,
      (stockByProduct.get(lot.variant.productId) ?? 0) +
        toKilos(num(lot.quantityAvailable), lot.variant.presentation),
    );
  }
  const publicStockKg = [...stockByProduct.values()].reduce((sum, kg) => sum + kg, 0);

  const recentKg = new Map<string, number>();
  for (const item of recentItems) {
    recentKg.set(
      item.variant.productId,
      (recentKg.get(item.variant.productId) ?? 0) +
        toKilos(num(item.quantity), item.presentationSnapshot),
    );
  }

  const reorder = [...new Set([...stockByProduct.keys(), ...recentKg.keys()])]
    .map((productId) => {
      const stock = stockByProduct.get(productId) ?? 0;
      const perDay = (recentKg.get(productId) ?? 0) / SALES_RATE_DAYS;
      return {
        productId,
        name: productName.get(productId) ?? "Producto",
        stockKg: stock,
        soldPerDayKg: perDay,
        ...daysOfStock(stock, perDay),
      };
    })
    // Lo más urgente primero; lo que no se vende, al final.
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));

  // ── Salidas que no son venta ───────────────────────────────
  const moved = (type: StockMovementType) =>
    Math.abs(num(movements.find((row) => row.type === type)?._sum.quantity));

  return {
    month,
    purchases: { kg: num(purchases._sum.kg), cost: num(purchases._sum.cost) },
    production: {
      fruitKg,
      publicKg,
      bulkKg,
      pulpKg,
      yieldPct: batchBreakdown(fruitKg, publicKg, bulkKg).yieldPct,
    },
    publicStockKg,
    funnel: funnel(fruitKg, pulpKg, soldKg),
    outflows: {
      soldKg,
      sampleKg: moved(StockMovementType.MUESTRA),
      returnedSellableKg: moved(StockMovementType.DEVOLUCION),
      returnedDamagedKg: moved(StockMovementType.DEVOLUCION_DANADA),
    },
    profitability,
    totals,
    yields,
    reorder,
    topSellers: [...profitability]
      .sort((a, b) => b.soldKg - a.soldKg)
      .slice(0, 8)
      .map((row) => ({ name: row.name, kg: row.soldKg })),
  };
}
