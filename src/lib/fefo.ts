/**
 * Reparto FEFO (*first expired, first out*).
 *
 * En producto congelado no es una optimización: despachar primero el lote que
 * vence antes es lo que evita que se pierda mercancía en cámara.
 *
 * Se mantiene puro —sin base de datos— para poder probar la aritmética del
 * reparto, que es donde de verdad puede fallar el inventario.
 */

export type AllocatableLot = {
  id: string;
  /** Saldo disponible del lote. */
  available: number;
};

export type Allocation = {
  lotId: string;
  /** Cantidad tomada de ese lote. */
  taken: number;
  /** Saldo del lote después de tomar. */
  remaining: number;
};

export type AllocationResult = {
  allocations: Allocation[];
  /** Cantidad que no se pudo cubrir. Cero si alcanzó. */
  shortfall: number;
};

/**
 * Reparte `quantity` entre los lotes recibidos, consumiéndolos en el orden en
 * que llegan. **La lista debe venir ya ordenada por fecha de vencimiento
 * ascendente**: esta función respeta el orden, no lo impone, porque quien
 * consulta la base es también quien bloquea las filas.
 *
 * Si no alcanza, devuelve el faltante en `shortfall` junto con lo que sí se
 * habría podido tomar; es responsabilidad de quien llama abortar la operación
 * completa en ese caso.
 */
export function allocateFefo(
  lots: readonly AllocatableLot[],
  quantity: number,
): AllocationResult {
  if (quantity <= 0) return { allocations: [], shortfall: 0 };

  const allocations: Allocation[] = [];
  let pending = quantity;

  for (const lot of lots) {
    if (pending <= 0) break;
    // Un lote sin saldo no aporta; saltarlo evita movimientos en cero.
    if (lot.available <= 0) continue;

    const taken = Math.min(lot.available, pending);
    allocations.push({
      lotId: lot.id,
      taken,
      remaining: lot.available - taken,
    });
    pending -= taken;
  }

  return { allocations, shortfall: pending > 0 ? pending : 0 };
}
