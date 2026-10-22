import { prisma } from "../db";
import type { SessionUser } from "../guards";
import { purchaseCost, weightedCostPerKg } from "@/lib/production";
import { monthBounds } from "@/lib/goals";
import type { PurchaseCreateInput } from "../validators/purchases";

/**
 * Compras de fruta (materia prima).
 *
 * Cada compra queda como un registro propio, nunca se fusiona con otra de la
 * misma fruta: el precio cambia entre proveedores y semanas, y eso es justo lo
 * que explica la rentabilidad. No mueve el inventario de pulpa.
 */

/** Frutas habituales, para sugerir en el formulario. Se puede escribir otra. */
export const COMMON_FRUITS = [
  "Mango",
  "Fresa",
  "Lulo",
  "Mora",
  "Guanábana",
  "Maracuyá",
  "Mandarina",
  "Uva",
  "Piña",
  "Naranja",
  "Limón",
  "Coco",
] as const;

export async function createPurchase(user: SessionUser, input: PurchaseCreateInput) {
  return prisma.fruitPurchase.create({
    data: {
      date: input.date,
      fruit: input.fruit,
      supplier: input.supplier,
      kg: input.kg,
      baseCost: input.baseCost,
      // El recargo de excipientes se fija aquí, no en el navegador.
      cost: purchaseCost(input.baseCost),
      notes: input.notes,
      userId: user.id,
    },
  });
}

/** Compras de un mes ("AAAA-MM"), de la más reciente a la más antigua. */
export async function listPurchases(month: string) {
  const { start, end } = monthBounds(month);

  const rows = await prisma.fruitPurchase.findMany({
    // `date` es una fecha de calendario (medianoche UTC): se compara en UTC.
    where: { date: { gte: utcDay(start), lt: utcDay(end) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { user: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    fruit: row.fruit,
    supplier: row.supplier,
    kg: Number(row.kg),
    baseCost: Number(row.baseCost),
    cost: Number(row.cost),
    registeredBy: row.user?.name ?? null,
  }));
}

/** Resumen por fruta: kilos, costo total y costo promedio por kilo. */
export function summarizeByFruit(purchases: readonly { fruit: string; kg: number; cost: number }[]) {
  const byFruit = new Map<string, { fruit: string; kg: number; cost: number }[]>();

  for (const purchase of purchases) {
    const key = purchase.fruit.trim().toLowerCase();
    byFruit.set(key, [...(byFruit.get(key) ?? []), purchase]);
  }

  return [...byFruit.values()]
    .map((group) => ({
      fruit: group[0].fruit,
      purchases: group.length,
      kg: group.reduce((sum, purchase) => sum + purchase.kg, 0),
      cost: group.reduce((sum, purchase) => sum + purchase.cost, 0),
      costPerKg: weightedCostPerKg(group),
    }))
    .sort((a, b) => b.cost - a.cost);
}

/**
 * Costo por kilo de una fruta según sus compras de los 60 días anteriores a
 * `asOf`. Si no hubo compras en esa ventana, usa la última conocida; sin
 * ninguna, no hay costo y la tanda queda sin costear en vez de inventarlo.
 */
export async function fruitCostPerKg(fruit: string, asOf: Date): Promise<number | null> {
  const windowStart = new Date(asOf.getTime() - 60 * 24 * 60 * 60 * 1000);
  const match = { fruit: { equals: fruit.trim(), mode: "insensitive" as const } };

  const recent = await prisma.fruitPurchase.findMany({
    where: { ...match, date: { gte: windowStart, lte: asOf } },
    select: { kg: true, cost: true },
  });

  if (recent.length > 0) {
    return weightedCostPerKg(recent.map((p) => ({ kg: Number(p.kg), cost: Number(p.cost) })));
  }

  const last = await prisma.fruitPurchase.findFirst({
    where: { ...match, date: { lte: asOf } },
    orderBy: { date: "desc" },
    select: { kg: true, cost: true },
  });

  return last ? weightedCostPerKg([{ kg: Number(last.kg), cost: Number(last.cost) }]) : null;
}

/** Medianoche UTC del día de Bogotá que corresponde a `instant`. */
function utcDay(instant: Date): Date {
  // Los límites del mes arrancan a las 05:00 UTC (medianoche de Bogotá); el
  // día de calendario es el de esa fecha.
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}
