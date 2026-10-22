import "dotenv/config";
import { prisma } from "../src/server/db";
import {
  addVariant,
  createProduct,
  updateProduct,
} from "../src/server/services/catalog";
import {
  bulkUpdatePrices,
  createPriceList,
} from "../src/server/services/pricing";
import {
  CATALOG,
  DEFAULT_LIST_NAME,
  PRICE_LIST_NAMES,
} from "./datos/catalogo-dicampo";

/**
 * Carga el catálogo de Dicampo: productos que faltan, fruta base y rendimiento
 * esperado, y los precios por nivel de cliente (Distribuidor, Mayorista,
 * Público general) como listas de precios.
 *
 * Por defecto solo informa. Escribe únicamente con `--aplicar`. Es
 * idempotente: lo que ya existe se deja igual y solo se completa lo que falta.
 *
 *   npx tsx scripts/cargar-catalogo.ts             # simulación
 *   npx tsx scripts/cargar-catalogo.ts --aplicar   # escribe
 *
 * Usa los servicios del catálogo (no escribe tablas a mano), así que respeta
 * las mismas reglas que los formularios. Lo que NO toca:
 *  - la "Lista General": se informan las diferencias con "Público general",
 *    pero cambiar el precio de lista es decisión comercial;
 *  - productos o variantes existentes, salvo fruta base y rendimiento si
 *    estaban vacíos.
 *
 * `DATABASE_URL` debe apuntar a la base que se quiere cargar.
 */

const APPLY = process.argv.includes("--aplicar");

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const summary = {
  productsCreated: 0,
  variantsCreated: 0,
  productsCompleted: 0,
  listsCreated: 0,
  pricesWritten: 0,
  pricesWithoutTier: [] as string[],
};

async function main() {
  console.log(APPLY ? "Cargando el catálogo…\n" : "Simulación del catálogo (nada se escribe)…\n");

  const products = await prisma.product.findMany({
    select: {
      id: true,
      flavor: true,
      baseFruit: true,
      expectedYieldPct: true,
      variants: { select: { id: true, sku: true, presentation: true } },
    },
  });
  const byFlavor = new Map(products.map((product) => [normalize(product.flavor), product]));
  const skuTaken = new Set(products.flatMap((product) => product.variants.map((v) => v.sku)));

  // ── Productos y variantes ──────────────────────────────────
  const variantIdBySku = new Map(
    products.flatMap((product) => product.variants.map((v) => [v.sku, v.id] as const)),
  );

  for (const spec of CATALOG) {
    let product = byFlavor.get(normalize(spec.flavor));

    if (!product) {
      console.log(`  + producto  ${spec.name} (${spec.category})`);
      summary.productsCreated += 1;

      if (APPLY) {
        const created = await createProduct({
          name: spec.name,
          flavor: spec.flavor,
          category: spec.category,
          taxRate: 0,
          active: true,
          baseFruit: spec.baseFruit ?? null,
          expectedYieldPct: spec.expectedYieldPct ?? null,
        });
        product = { id: created.id, flavor: spec.flavor, baseFruit: spec.baseFruit ?? null, expectedYieldPct: spec.expectedYieldPct ?? null, variants: [] };
        byFlavor.set(normalize(spec.flavor), product);
      }
    } else {
      // Solo se completa lo que está vacío: nunca se pisa lo que alguien ya fijó.
      const patch: { baseFruit?: string; expectedYieldPct?: number } = {};
      if (!product.baseFruit && spec.baseFruit) patch.baseFruit = spec.baseFruit;
      if (product.expectedYieldPct === null && spec.expectedYieldPct !== undefined) {
        patch.expectedYieldPct = spec.expectedYieldPct;
      }

      if (Object.keys(patch).length > 0) {
        console.log(`  ~ completa  ${spec.name}: ${JSON.stringify(patch)}`);
        summary.productsCompleted += 1;
        if (APPLY) await updateProduct(product.id, patch);
      }
    }

    for (const variant of spec.variants) {
      const exists = product?.variants.some(
        (existing) => existing.sku === variant.sku || existing.presentation === variant.presentation,
      );
      if (exists) continue;

      if (skuTaken.has(variant.sku)) {
        console.log(`  ! el SKU ${variant.sku} ya lo usa otro producto: se omite.`);
        continue;
      }

      console.log(`  + variante  ${spec.name} · ${variant.presentation} (${variant.sku})`);
      summary.variantsCreated += 1;
      skuTaken.add(variant.sku);

      if (APPLY && product) {
        // El precio por defecto de una variante nueva es el de público general.
        const created = await addVariant(product.id, {
          presentation: variant.presentation,
          sku: variant.sku,
          active: true,
          price: variant.tiers?.[2],
        });
        variantIdBySku.set(variant.sku, created.id);
      }
    }
  }

  // ── Listas de precios por nivel ────────────────────────────
  const lists = await prisma.priceList.findMany({ select: { id: true, name: true } });
  const listIdByName = new Map(lists.map((list) => [normalize(list.name), list.id]));

  for (const name of PRICE_LIST_NAMES) {
    if (listIdByName.has(normalize(name))) continue;

    console.log(`  + lista de precios  ${name}`);
    summary.listsCreated += 1;

    if (APPLY) {
      const created = await createPriceList({ name, isDefault: false, active: true });
      listIdByName.set(normalize(name), created.id);
    }
  }

  PRICE_LIST_NAMES.forEach((listName, tierIndex) => {
    const items = CATALOG.flatMap((spec) =>
      spec.variants.flatMap((variant) => {
        if (!variant.tiers) {
          if (tierIndex === 0) summary.pricesWithoutTier.push(variant.sku);
          return [];
        }
        return [{ sku: variant.sku, price: variant.tiers[tierIndex] }];
      }),
    );
    summary.pricesWritten += items.length;
    pending.push({ listName, items });
  });

  for (const { listName, items } of pending) {
    console.log(`  $ ${listName}: ${items.length} precios`);
    const listId = listIdByName.get(normalize(listName));

    if (APPLY && listId) {
      const resolved = items.flatMap((item) => {
        const variantId = variantIdBySku.get(item.sku);
        return variantId ? [{ variantId, price: item.price, minQty: 1 }] : [];
      });
      await bulkUpdatePrices({ priceListId: listId, items: resolved });
    }
  }

  // ── Diferencias con la Lista General (solo se informan) ────
  const general = await prisma.priceList.findFirst({
    where: { name: DEFAULT_LIST_NAME },
    select: { items: { where: { minQty: 1 }, select: { price: true, variant: { select: { sku: true } } } } },
  });

  if (general) {
    const generalBySku = new Map(general.items.map((item) => [item.variant.sku, Number(item.price)]));
    const diffs = CATALOG.flatMap((spec) =>
      spec.variants.flatMap((variant) => {
        const current = generalBySku.get(variant.sku);
        const sheet = variant.tiers?.[2];
        return current !== undefined && sheet !== undefined && current !== sheet
          ? [`${variant.sku}: ${current.toLocaleString("es-CO")} → ${sheet.toLocaleString("es-CO")}`]
          : [];
      }),
    );

    if (diffs.length > 0) {
      console.log(`\n  "${DEFAULT_LIST_NAME}" difiere de "Público general" en ${diffs.length} precios (no se modifican):`);
      diffs.forEach((line) => console.log(`      ${line}`));
    }
  }

  console.log(`
Resumen${APPLY ? "" : " (simulado)"}:
  productos nuevos:        ${summary.productsCreated}
  variantes nuevas:        ${summary.variantsCreated}
  productos completados:   ${summary.productsCompleted}
  listas nuevas:           ${summary.listsCreated}
  precios por nivel:       ${summary.pricesWritten}
  variantes sin tarifa:    ${summary.pricesWithoutTier.join(", ") || "ninguna"}`);

  if (!APPLY) console.log("\nAgrega --aplicar para escribir.");
}

/** Precios por lista, acumulados antes de escribirlos. */
const pending: { listName: string; items: { sku: string; price: number }[] }[] = [];

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
