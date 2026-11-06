/**
 * Prioridades de producción: qué sabores faltan o están por agotarse.
 *
 * Pura y sin base de datos. Las cantidades son kilos de pulpa (una libra es
 * medio kilo). El inventario se descuenta al confirmar el pedido, así que hay
 * dos cifras de "stock":
 * - **físico**: lo que hay en bodega, incluido lo ya reservado que sale hoy;
 * - **disponible**: lo que queda libre una vez despachados esos pedidos.
 */

/** Bajo este saldo (kg) un sabor pasa a prioridad media. */
export const MEDIUM_PRIORITY_KG = 50;

export type ProductionPriority = "ALTA" | "MEDIA";

export type PriorityReason =
  | "SIN_STOCK"
  | "PEDIDOS_SUPERAN_STOCK"
  | "POCO_STOCK"
  | "POCO_TRAS_DESPACHO";

export type PriorityInput = {
  /** Kilos en bodega, incluido lo reservado para pedidos por despachar. */
  physicalKg: number;
  /** Kilos libres tras despachar los pedidos ya reservados. */
  availableKg: number;
  /** Kilos de pedidos que aún no reservaron inventario (borradores). */
  unreservedKg: number;
};

export function productionPriority(
  input: PriorityInput,
): { priority: ProductionPriority; reason: PriorityReason } | null {
  const { physicalKg, availableKg, unreservedKg } = input;

  if (physicalKg <= 0) return { priority: "ALTA", reason: "SIN_STOCK" };
  if (unreservedKg > availableKg) return { priority: "ALTA", reason: "PEDIDOS_SUPERAN_STOCK" };
  if (physicalKg < MEDIUM_PRIORITY_KG) return { priority: "MEDIA", reason: "POCO_STOCK" };
  if (availableKg < MEDIUM_PRIORITY_KG) return { priority: "MEDIA", reason: "POCO_TRAS_DESPACHO" };

  return null;
}

export const PRIORITY_REASON_LABEL: Record<PriorityReason, string> = {
  SIN_STOCK: "Sin stock",
  PEDIDOS_SUPERAN_STOCK: "Hay más pedidos que stock",
  POCO_STOCK: "Menos de 50 kg en stock",
  POCO_TRAS_DESPACHO: "Quedan menos de 50 kg tras despachar",
};
