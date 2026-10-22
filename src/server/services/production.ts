import { prisma } from "../db";
import { BusinessRuleError, NotFoundError } from "../errors";
import { Presentation, StockMovementType } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import { lockKey } from "../locks";
import { batchBreakdown } from "@/lib/production";
import { fruitCostPerKg } from "./purchases";
import type { BatchCreateInput } from "../validators/production";

/**
 * Producción: una tanda registra la fruta que entró a despulpar y cómo se
 * repartió. Lo que se vende (pulpa pública) se vuelve un lote con FEFO y su
 * entrada en el kardex; el granel y el desperdicio solo se contabilizan.
 *
 * Este rol registra, no corrige: una cantidad mal digitada se arregla con un
 * ajuste de inventario (que deja huella), no editando la tanda.
 */

/** Código de lote: L-AAAAMMDD-MAN, con -2, -3… si ya hay otro del mismo día. */
async function nextLotCode(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  variantId: string,
  sku: string,
  date: Date,
): Promise<string> {
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const base = `L-${stamp}-${sku.split("-")[0]}`;

  await lockKey(tx, `lot-code:${variantId}:${stamp}`);

  const existing = await tx.lot.findMany({
    where: { variantId, lotCode: { startsWith: base } },
    select: { lotCode: true },
  });
  if (existing.length === 0) return base;

  const suffixes = existing.map((lot) => Number(lot.lotCode.slice(base.length + 1)) || 1);
  return `${base}-${Math.max(...suffixes) + 1}`;
}

export async function registerBatch(user: SessionUser, input: BatchCreateInput) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      name: true,
      flavor: true,
      baseFruit: true,
      active: true,
      variants: {
        where: { presentation: Presentation.KILO, active: true },
        select: { id: true, sku: true },
        take: 1,
      },
    },
  });

  if (!product || !product.active) throw new NotFoundError("El producto");

  const variant = product.variants[0];
  if (input.publicKg > 0 && !variant) {
    throw new BusinessRuleError(
      `${product.name} no tiene presentación de 1 kg: créala en el catálogo para registrar pulpa pública.`,
    );
  }

  if (input.expiryDate && input.expiryDate <= input.date) {
    throw new BusinessRuleError("El vencimiento debe ser posterior a la fecha de producción.");
  }

  const { wasteKg } = batchBreakdown(input.fruitKg, input.publicKg, input.bulkKg);

  // Foto del costo de la fruta al producir; sin compras, queda sin costear.
  const perKg = await fruitCostPerKg(product.baseFruit ?? product.flavor, input.date);
  const fruitCost = perKg === null ? null : Math.round(perKg * input.fruitKg);

  return prisma.$transaction(async (tx) => {
    let lotId: string | null = null;

    if (input.publicKg > 0 && variant) {
      const lot = await tx.lot.create({
        data: {
          variantId: variant.id,
          lotCode: await nextLotCode(tx, variant.id, variant.sku, input.date),
          productionDate: input.date,
          expiryDate: input.expiryDate!,
          quantityInitial: input.publicKg,
          quantityAvailable: input.publicKg,
          notes: input.notes,
        },
      });
      lotId = lot.id;

      await tx.stockMovement.create({
        data: {
          type: StockMovementType.ENTRADA_PRODUCCION,
          variantId: variant.id,
          lotId: lot.id,
          quantity: input.publicKg,
          userId: user.id,
          reason: "Tanda de producción",
        },
      });
    }

    return tx.productionBatch.create({
      data: {
        productId: product.id,
        date: input.date,
        fruitKg: input.fruitKg,
        publicKg: input.publicKg,
        bulkKg: input.bulkKg,
        wasteKg,
        fruitCost,
        lotId,
        userId: user.id,
        notes: input.notes,
      },
      include: { lot: { select: { id: true, lotCode: true } } },
    });
  });
}

/** Tandas recientes, de la más nueva a la más antigua. */
export async function listBatches(take = 30) {
  const rows = await prisma.productionBatch.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      product: { select: { name: true } },
      lot: { select: { id: true, lotCode: true } },
      user: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const fruitKg = Number(row.fruitKg);
    const publicKg = Number(row.publicKg);
    const bulkKg = Number(row.bulkKg);

    return {
      id: row.id,
      date: row.date,
      productName: row.product.name,
      fruitKg,
      publicKg,
      bulkKg,
      wasteKg: Number(row.wasteKg),
      yieldPct: batchBreakdown(fruitKg, publicKg, bulkKg).yieldPct,
      lot: row.lot,
      registeredBy: row.user?.name ?? null,
    };
  });
}
