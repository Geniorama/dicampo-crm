/**
 * Aritmética de materia prima y producción.
 *
 * Pura y sin base de datos: la usan el formulario de producción (para mostrar
 * el desperdicio en vivo) y los servicios (para guardar exactamente lo mismo).
 */

/**
 * Vida útil que se propone para un lote de pulpa congelada. Es solo el valor
 * inicial del formulario: quien registra la tanda puede cambiar el vencimiento.
 */
export const DEFAULT_SHELF_LIFE_DAYS = 365;

/** "AAAA-MM-DD" más N días, en calendario UTC (las fechas de lote son de calendario). */
export function addDaysToDateString(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** Recargo de excipientes sobre el costo del lote de fruta. */
export const EXCIPIENT_RATE = 0.05;

/** Bajo este saldo (kg) se avisa que el producto va a agotarse. */
export const LOW_STOCK_KG = 30;

/** Puntos de rendimiento por debajo de lo esperado que ya se consideran problema. */
export const YIELD_TOLERANCE_PTS = 8;

/** Costo de materia prima de una compra: el lote más sus excipientes, en pesos enteros. */
export function purchaseCost(baseCost: number): number {
  return Math.round(baseCost * (1 + EXCIPIENT_RATE));
}

export type BatchBreakdown = {
  /** Pulpa total: pública más granel. */
  pulpKg: number;
  wasteKg: number;
  /** Rendimiento: % de la fruta que quedó como pulpa. */
  yieldPct: number;
  wastePct: number;
  /** La pulpa no puede pesar más que la fruta de la que salió. */
  exceedsFruit: boolean;
};

export function batchBreakdown(fruitKg: number, publicKg: number, bulkKg: number): BatchBreakdown {
  const pulpKg = publicKg + bulkKg;
  const wasteKg = Math.max(0, fruitKg - pulpKg);

  return {
    pulpKg,
    wasteKg,
    yieldPct: fruitKg > 0 ? Math.round((pulpKg / fruitKg) * 100) : 0,
    wastePct: fruitKg > 0 ? Math.round((wasteKg / fruitKg) * 100) : 0,
    exceedsFruit: pulpKg > fruitKg,
  };
}

export type YieldFlag = "NORMAL" | "REVISAR" | "SIN_DATO";

/** Un rendimiento 8 puntos por debajo de lo esperado merece revisión. */
export function yieldFlag(actualPct: number | null, expectedPct: number | null): YieldFlag {
  if (actualPct === null || expectedPct === null) return "SIN_DATO";
  return actualPct - expectedPct <= -YIELD_TOLERANCE_PTS ? "REVISAR" : "NORMAL";
}

export type StockLevel = "AGOTADO" | "BAJO" | "OK";

export function stockLevel(kg: number): StockLevel {
  if (kg <= 0) return "AGOTADO";
  return kg < LOW_STOCK_KG ? "BAJO" : "OK";
}

export type ReorderStatus = "PRODUCIR_YA" | "PRONTO" | "SANO" | "SIN_VENTAS";

/** Cuántos días alcanza el stock al ritmo de venta, y qué tan urgente es producir. */
export function daysOfStock(
  stockKg: number,
  soldPerDayKg: number,
): { days: number | null; status: ReorderStatus } {
  if (soldPerDayKg <= 0) return { days: null, status: "SIN_VENTAS" };

  const days = Math.round((stockKg / soldPerDayKg) * 10) / 10;
  if (days <= 3) return { days, status: "PRODUCIR_YA" };
  if (days <= 6) return { days, status: "PRONTO" };
  return { days, status: "SANO" };
}

/** Costo por kilo de fruta, ponderado por kilos: dos compras a distinto precio no se promedian a ojo. */
export function weightedCostPerKg(purchases: readonly { kg: number; cost: number }[]): number | null {
  const kg = purchases.reduce((sum, purchase) => sum + purchase.kg, 0);
  if (kg <= 0) return null;

  return purchases.reduce((sum, purchase) => sum + purchase.cost, 0) / kg;
}

/**
 * Kilos de pulpa de una cantidad vendida: una libra es medio kilo. Los zumos
 * se venden por litros y no son pulpa, así que no suman kilos.
 */
export function toKilos(quantity: number, presentation: string): number {
  if (presentation === "KILO") return quantity;
  if (presentation === "LIBRA") return quantity / 2;
  return 0;
}

export type Funnel = {
  fruitKg: number;
  pulpKg: number;
  soldKg: number;
  pulpPct: number;
  soldPct: number;
};

/** De cada 100 kg de fruta: cuántos son pulpa y cuántos se vendieron. */
export function funnel(fruitKg: number, pulpKg: number, soldKg: number): Funnel {
  const pct = (value: number) => (fruitKg > 0 ? Math.round((value / fruitKg) * 100) : 0);
  return { fruitKg, pulpKg, soldKg, pulpPct: pct(pulpKg), soldPct: pct(soldKg) };
}

export type Margin = { cost: number; sales: number; profit: number; marginPct: number | null };

export function margin(sales: number, cost: number): Margin {
  const profit = sales - cost;
  return {
    cost,
    sales,
    profit,
    marginPct: sales > 0 ? Math.round((profit / sales) * 100) : null,
  };
}
