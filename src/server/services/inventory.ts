import { Prisma } from "@/generated/prisma/client";
import { LotStatus, StockMovementType } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";
import type { SessionUser } from "../guards";
import { allocateFefo } from "@/lib/fefo";
import type {
  LotCreateInput,
  LotListQuery,
  StockAdjustmentInput,
} from "../validators/inventory";

/**
 * Inventario de producto congelado.
 *
 * Dos invariantes sostienen todo el módulo:
 *
 * 1. `Lot.quantityAvailable` es el saldo vivo y solo se toca dentro de una
 *    transacción que además escribe el `StockMovement` correspondiente. El
 *    kardex es la auditoría: nunca se edita ni se borra.
 *
 * 2. La salida es **FEFO** (first expired, first out): se consume primero el
 *    lote que vence antes. En producto congelado esto no es una optimización,
 *    es lo que evita que se venza mercancía en cámara.
 */

/** Cliente de Prisma dentro de una transacción. */
type Tx = Prisma.TransactionClient;

type LotRow = { id: string; quantityAvailable: string | number };

/**
 * Lotes disponibles de una variante, ordenados por vencimiento y **bloqueados**
 * hasta el final de la transacción.
 *
 * El `FOR UPDATE` es imprescindible: sin él, dos confirmaciones simultáneas
 * leerían el mismo saldo y venderían dos veces el mismo lote. Va en SQL
 * directo porque Prisma no expone bloqueo de filas.
 */
async function lockAvailableLots(tx: Tx, variantId: string): Promise<LotRow[]> {
  return tx.$queryRaw<LotRow[]>`
    SELECT id, "quantityAvailable"
    FROM "Lot"
    WHERE "variantId" = ${variantId}
      AND status = ${LotStatus.DISPONIBLE}::"LotStatus"
      AND "quantityAvailable" > 0
    ORDER BY "expiryDate" ASC, "createdAt" ASC
    FOR UPDATE
  `;
}

/**
 * Descuenta del inventario las cantidades de un pedido, repartiéndolas entre
 * lotes por FEFO. Se ejecuta al confirmar el pedido.
 *
 * Falla completa si algún producto no alcanza: un pedido parcialmente
 * descontado dejaría el inventario mintiendo.
 */
export async function allocateStockForOrder(
  tx: Tx,
  orderId: string,
  userId: string,
) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: {
      variantId: true,
      quantity: true,
      productNameSnapshot: true,
      presentationSnapshot: true,
    },
  });

  for (const item of items) {
    // Ya vienen ordenados por vencimiento y bloqueados hasta el commit.
    const lots = await lockAvailableLots(tx, item.variantId);

    const { allocations, shortfall } = allocateFefo(
      lots.map((lot) => ({
        id: lot.id,
        available: Number(lot.quantityAvailable),
      })),
      Number(item.quantity),
    );

    // Se comprueba ANTES de escribir: la transacción abortaría igual, pero
    // fallar temprano deja el error más claro y evita trabajo inútil.
    if (shortfall > 0) {
      throw new BusinessRuleError(
        `No hay inventario suficiente de ${item.productNameSnapshot} (${item.presentationSnapshot}). Faltan ${shortfall}.`,
        { variantId: item.variantId, missing: shortfall },
      );
    }

    for (const allocation of allocations) {
      await tx.lot.update({
        where: { id: allocation.lotId },
        data: {
          quantityAvailable: allocation.remaining,
          // Un lote en cero sale de la rotación, pero conserva su historia.
          ...(allocation.remaining === 0 ? { status: LotStatus.AGOTADO } : {}),
        },
      });

      await tx.stockMovement.create({
        data: {
          type: StockMovementType.SALIDA_VENTA,
          variantId: item.variantId,
          lotId: allocation.lotId,
          // Negativo: sale de bodega.
          quantity: -allocation.taken,
          orderId,
          userId,
          reason: "Confirmación de pedido",
        },
      });
    }
  }
}

/**
 * Devuelve al inventario lo que se había descontado por un pedido, usando el
 * kardex para saber exactamente de qué lote salió cada unidad.
 */
export async function returnStockForOrder(
  tx: Tx,
  orderId: string,
  userId: string,
  reason: string,
) {
  const movements = await tx.stockMovement.findMany({
    where: { orderId, type: StockMovementType.SALIDA_VENTA },
    select: { variantId: true, lotId: true, quantity: true },
  });

  for (const movement of movements) {
    if (!movement.lotId) continue;

    // La salida se guardó en negativo; devolver es sumar su valor absoluto.
    const amount = Math.abs(Number(movement.quantity));

    const lot = await tx.lot.findUnique({
      where: { id: movement.lotId },
      select: { quantityAvailable: true, status: true, expiryDate: true },
    });
    if (!lot) continue;

    const restored = Number(lot.quantityAvailable) + amount;
    const isExpired = lot.expiryDate.getTime() < Date.now();

    await tx.lot.update({
      where: { id: movement.lotId },
      data: {
        quantityAvailable: restored,
        // Un lote que volvió a tener saldo se reactiva, salvo que ya venciera
        // mientras estaba fuera, o que esté bloqueado por calidad.
        ...(lot.status === LotStatus.AGOTADO
          ? { status: isExpired ? LotStatus.VENCIDO : LotStatus.DISPONIBLE }
          : {}),
      },
    });

    await tx.stockMovement.create({
      data: {
        type: StockMovementType.DEVOLUCION,
        variantId: movement.variantId,
        lotId: movement.lotId,
        quantity: amount,
        orderId,
        userId,
        reason,
      },
    });
  }
}

// ── Entradas de producción ───────────────────────────────────

export async function registerLot(user: SessionUser, input: LotCreateInput) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true },
  });
  if (!variant) throw new NotFoundError("La variante");

  if (input.expiryDate <= input.productionDate) {
    throw new BusinessRuleError(
      "La fecha de vencimiento debe ser posterior a la de producción.",
    );
  }

  const duplicate = await prisma.lot.findUnique({
    where: {
      variantId_lotCode: { variantId: input.variantId, lotCode: input.lotCode },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(
      `Ya existe el lote "${input.lotCode}" para este producto.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        variantId: input.variantId,
        lotCode: input.lotCode,
        productionDate: input.productionDate,
        expiryDate: input.expiryDate,
        quantityInitial: input.quantity,
        quantityAvailable: input.quantity,
        notes: input.notes,
      },
    });

    await tx.stockMovement.create({
      data: {
        type: StockMovementType.ENTRADA_PRODUCCION,
        variantId: input.variantId,
        lotId: lot.id,
        quantity: input.quantity,
        userId: user.id,
        reason: "Entrada de producción",
      },
    });

    return lot;
  });
}

/**
 * Ajuste manual o merma sobre un lote. La cantidad va con signo: negativa
 * para bajas (producto dañado, rotura de cadena de frío), positiva para
 * correcciones de conteo.
 */
export async function adjustStock(
  user: SessionUser,
  input: StockAdjustmentInput,
) {
  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.findUnique({
      where: { id: input.lotId },
      select: {
        id: true,
        variantId: true,
        quantityAvailable: true,
        expiryDate: true,
      },
    });
    if (!lot) throw new NotFoundError("El lote");

    const current = Number(lot.quantityAvailable);
    const next = current + input.quantity;

    if (next < 0) {
      throw new BusinessRuleError(
        `El ajuste dejaría el lote en negativo (saldo actual: ${current}).`,
      );
    }

    await tx.lot.update({
      where: { id: lot.id },
      data: {
        quantityAvailable: next,
        status:
          next === 0
            ? LotStatus.AGOTADO
            : lot.expiryDate.getTime() < Date.now()
              ? LotStatus.VENCIDO
              : LotStatus.DISPONIBLE,
      },
    });

    return tx.stockMovement.create({
      data: {
        type: input.type,
        variantId: lot.variantId,
        lotId: lot.id,
        quantity: input.quantity,
        userId: user.id,
        reason: input.reason,
      },
    });
  });
}

// ── Consultas ────────────────────────────────────────────────

export async function listLots(query: LotListQuery) {
  const { variantId, status, expiringInDays, page, pageSize } = query;

  const where = {
    ...(variantId ? { variantId } : {}),
    ...(status ? { status } : {}),
    ...(expiringInDays
      ? {
          quantityAvailable: { gt: 0 },
          expiryDate: {
            lte: new Date(Date.now() + expiringInDays * 24 * 60 * 60 * 1000),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      orderBy: [{ expiryDate: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            presentation: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    prisma.lot.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Existencias consolidadas por variante, sumando los lotes con saldo. */
export async function getStockSummary() {
  const grouped = await prisma.lot.groupBy({
    by: ["variantId"],
    where: { status: LotStatus.DISPONIBLE, quantityAvailable: { gt: 0 } },
    _sum: { quantityAvailable: true },
  });

  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { presentation: "asc" }],
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { id: true, name: true } },
    },
  });

  const stockByVariant = new Map(
    grouped.map((row) => [row.variantId, Number(row._sum?.quantityAvailable ?? 0)]),
  );

  return variants.map((variant) => ({
    ...variant,
    available: stockByVariant.get(variant.id) ?? 0,
  }));
}

/** Kardex: movimientos de una variante, del más reciente al más antiguo. */
export async function getKardex(variantId: string, take = 100) {
  return prisma.stockMovement.findMany({
    where: { variantId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      lot: { select: { id: true, lotCode: true, expiryDate: true } },
      user: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true } },
    },
  });
}

/**
 * Marca como VENCIDOS los lotes cuya fecha ya pasó. Pensado para ejecutarse
 * a diario; también se puede disparar a mano desde la interfaz.
 */
export async function expireOverdueLots() {
  const result = await prisma.lot.updateMany({
    where: {
      status: LotStatus.DISPONIBLE,
      expiryDate: { lt: new Date() },
    },
    data: { status: LotStatus.VENCIDO },
  });

  return { expired: result.count };
}
