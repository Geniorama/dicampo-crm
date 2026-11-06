import type { prisma } from "../db";

/**
 * Lista de precios que rige cuando nadie indica otra.
 *
 * Es la marcada `isDefault`. Si ninguna lo está (pasó en producción: las listas
 * por nivel se cargaron sin marcar una), se cae a "Público general" y, en último
 * término, a la primera lista activa. Sin esto el catálogo mostraba "sin precio"
 * en todo y no se podía armar un pedido aunque los precios estuvieran cargados.
 */
export const FALLBACK_PRICE_LIST_NAME = "Público general";

type Db = Pick<typeof prisma, "priceList">;

export async function findDefaultPriceList(
  db: Db,
): Promise<{ id: string; name: string } | null> {
  const select = { id: true, name: true } as const;

  return (
    (await db.priceList.findFirst({ where: { isDefault: true, active: true }, select })) ??
    (await db.priceList.findFirst({
      where: { name: FALLBACK_PRICE_LIST_NAME, active: true },
      select,
    })) ??
    (await db.priceList.findFirst({ where: { active: true }, orderBy: { name: "asc" }, select }))
  );
}
