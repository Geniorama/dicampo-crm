import { prisma } from "../db";
import { BusinessRuleError, NotFoundError } from "../errors";
import type { PriceBulkUpdateInput, PriceListCreateInput } from "../validators/catalog";

/**
 * Resolución de precios.
 *
 * Cada cliente puede tener su propia lista; si no la tiene, aplica la lista
 * marcada como `isDefault`. Dentro de una lista, una variante puede tener
 * varios escalones por cantidad mínima (`minQty`), que es como se manejan los
 * descuentos por volumen.
 */

export type PriceTier = { price: number; minQty: number };

/**
 * Elige el escalón aplicable: el de mayor `minQty` que no supere la cantidad
 * pedida. Función pura para poder probarla sin base de datos.
 */
export function pickTier(
  tiers: readonly PriceTier[],
  quantity: number,
): PriceTier | null {
  const applicable = tiers
    .filter((tier) => quantity >= tier.minQty)
    .sort((a, b) => b.minQty - a.minQty);

  return applicable[0] ?? null;
}

export type PriceResolver = {
  priceListId: string;
  priceListName: string;
  /** Precio unitario para la cantidad dada, o `null` si la variante no está en la lista. */
  unitPriceFor(variantId: string, quantity: number): number | null;
};

/**
 * Prepara un resolutor con todos los precios cargados de una sola consulta,
 * para no golpear la base una vez por línea del pedido.
 */
export async function buildPriceResolver(
  variantIds: readonly string[],
  priceListId?: string | null,
): Promise<PriceResolver> {
  const priceList = priceListId
    ? await prisma.priceList.findFirst({
        where: { id: priceListId, active: true },
        select: { id: true, name: true },
      })
    : null;

  const effectiveList =
    priceList ??
    (await prisma.priceList.findFirst({
      where: { isDefault: true, active: true },
      select: { id: true, name: true },
    }));

  if (!effectiveList) {
    throw new BusinessRuleError(
      "No hay una lista de precios por defecto configurada. Créala antes de tomar pedidos.",
    );
  }

  const items = await prisma.priceListItem.findMany({
    where: {
      priceListId: effectiveList.id,
      variantId: { in: [...variantIds] },
    },
    select: { variantId: true, price: true, minQty: true },
  });

  const tiersByVariant = new Map<string, PriceTier[]>();
  for (const item of items) {
    const tiers = tiersByVariant.get(item.variantId) ?? [];
    tiers.push({ price: Number(item.price), minQty: Number(item.minQty) });
    tiersByVariant.set(item.variantId, tiers);
  }

  return {
    priceListId: effectiveList.id,
    priceListName: effectiveList.name,
    unitPriceFor(variantId, quantity) {
      const tiers = tiersByVariant.get(variantId);
      if (!tiers || tiers.length === 0) return null;
      return pickTier(tiers, quantity)?.price ?? null;
    },
  };
}

// ── Administración de listas ─────────────────────────────────

export async function listPriceLists() {
  return prisma.priceList.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { _count: { select: { items: true, clients: true } } },
  });
}

export async function createPriceList(input: PriceListCreateInput) {
  return prisma.$transaction(async (tx) => {
    // Solo puede haber una lista por defecto.
    if (input.isDefault) {
      await tx.priceList.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.priceList.create({ data: input });
  });
}

/** Actualiza varios precios de una lista en un solo movimiento. */
export async function bulkUpdatePrices(input: PriceBulkUpdateInput) {
  const priceList = await prisma.priceList.findUnique({
    where: { id: input.priceListId },
    select: { id: true },
  });
  if (!priceList) throw new NotFoundError("La lista de precios");

  return prisma.$transaction(
    input.items.map((item) =>
      prisma.priceListItem.upsert({
        where: {
          priceListId_variantId_minQty: {
            priceListId: input.priceListId,
            variantId: item.variantId,
            minQty: item.minQty,
          },
        },
        update: { price: item.price },
        create: {
          priceListId: input.priceListId,
          variantId: item.variantId,
          price: item.price,
          minQty: item.minQty,
        },
      }),
    ),
  );
}
