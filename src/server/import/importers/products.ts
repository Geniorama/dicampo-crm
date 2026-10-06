import type { Presentation } from "@/generated/prisma/enums";
import { PRESENTATION_LABEL, PRODUCT_CATEGORY_LABEL } from "@/lib/labels";
import { parseDecimal } from "@/lib/import/values";
import { prisma } from "../../db";
import { ValidationError } from "../../errors";
import {
  addVariant,
  createProduct,
  updateProduct,
  updateVariant,
} from "../../services/catalog";
import { bulkUpdatePrices } from "../../services/pricing";
import { productCreateSchema, productUpdateSchema } from "../../validators/catalog";
import {
  loadPriceListIndex,
  resolvePriceList,
  type PriceListIndex,
  type PriceListRef,
} from "../context";
import {
  boolean,
  comparisonKey,
  compact,
  decimal,
  enumValue,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva del catálogo: sabores, presentaciones y su precio.
 *
 * El sabor es la identidad —es único en el esquema—, así que dos filas con
 * "Mango" y presentaciones distintas dan un producto con dos variantes, que
 * es exactamente como se vende.
 */

type VariantRow = { id: string; presentation: Presentation; sku: string };

type ProductRow = {
  id: string;
  flavor: string;
  name: string;
  variants: VariantRow[];
};

type Ctx = {
  products: Map<string, ProductRow>;
  priceLists: PriceListIndex;
};

/** Las únicas tarifas de IVA del negocio. */
const ALLOWED_TAX_RATES = [0, 0.05, 0.19];

/**
 * Tarifa de IVA, admitiendo las dos formas de escribirla: "19", "19 %" o
 * "0,19". Cualquier valor mayor que 1 se lee como porcentaje.
 *
 * Después se exige que sea una de las tres tarifas del negocio. Sin ese
 * filtro, un "19" interpretado como fracción multiplicaría el impuesto por
 * cien en todos los pedidos futuros de ese producto.
 */
function readTaxRate(record: RowRecord): number | undefined {
  const raw = text(record, "taxRate");
  if (raw === undefined) return undefined;

  const value = parseDecimal(raw.replace("%", ""));
  if (value === null) {
    throw new ValidationError(`IVA: no se entiende «${raw}».`);
  }

  const rate = value > 1 ? value / 100 : value;
  const allowed = ALLOWED_TAX_RATES.find(
    (candidate) => Math.abs(candidate - rate) < 0.0001,
  );

  if (allowed === undefined) {
    throw new ValidationError(
      `IVA: «${raw}» no es una tarifa admitida. Usa 0, 5 o 19.`,
    );
  }

  return allowed;
}

async function loadProducts(): Promise<Map<string, ProductRow>> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      flavor: true,
      name: true,
      variants: { select: { id: true, presentation: true, sku: true } },
    },
  });

  return new Map(
    products.map((product) => [comparisonKey(product.flavor), product]),
  );
}

/** Deja el precio en la lista que pida la fila, con el escalón base. */
async function savePrice(
  priceList: PriceListRef,
  variantId: string,
  price: number,
): Promise<void> {
  await bulkUpdatePrices({
    priceListId: priceList.id,
    items: [{ variantId, price, minQty: 1 }],
  });
}

export const productsImporter: Importer<Ctx> = {
  async load() {
    const [products, priceLists] = await Promise.all([
      loadProducts(),
      loadPriceListIndex(),
    ]);

    return { products, priceLists };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const flavor = requiredText(record, "flavor", "Sabor");
    const name = requiredText(record, "name", "Nombre del producto");
    const label = name;

    const existing = ctx.products.get(comparisonKey(flavor));

    if (existing && options.mode === "crear") {
      return { action: "omitir", label, message: "El sabor ya existe." };
    }
    if (!existing && options.mode === "actualizar") {
      return { action: "omitir", label, message: "El sabor todavía no existe." };
    }

    const presentation = enumValue(
      record,
      "presentation",
      PRESENTATION_LABEL,
      "Presentación",
    );
    const price = decimal(record, "price", "Precio");
    const sku = text(record, "sku");

    const priceListName = text(record, "priceListName");
    // Solo hace falta resolver la lista si la fila trae precio.
    const priceList =
      price !== undefined
        ? resolvePriceList(ctx.priceLists, priceListName)
        : undefined;
    const isDefaultList =
      priceList !== undefined && priceList.id === ctx.priceLists.fallback?.id;

    if (price !== undefined && presentation === undefined) {
      throw new ValidationError(
        "Precio: falta la presentación. El precio es de una unidad vendible, no del sabor.",
      );
    }

    const payload = {
      name,
      flavor,
      category: enumValue(
        record,
        "category",
        PRODUCT_CATEGORY_LABEL,
        "Categoría",
      ),
      description: text(record, "description"),
      taxRate: readTaxRate(record),
      active: boolean(record, "active", "¿Activo?"),
    };

    if (!existing) {
      const input = productCreateSchema.parse(
        compact({
          ...payload,
          firstPresentation: presentation,
          // El servicio deja el precio en la lista por defecto; si la fila
          // pide otra lista, se aplica aparte más abajo.
          firstPrice: isDefaultList ? price : undefined,
        }),
      );

      if (options.dryRun) {
        return { action: "crear", label, message: describePlan(presentation, price) };
      }

      const product = await createProduct(input);
      const variants = await prisma.productVariant.findMany({
        where: { productId: product.id },
        select: { id: true, presentation: true, sku: true },
      });

      ctx.products.set(comparisonKey(flavor), {
        id: product.id,
        flavor: product.flavor,
        name: product.name,
        variants,
      });

      if (price !== undefined && priceList && !isDefaultList) {
        const variant = variants.find((row) => row.presentation === presentation);
        if (variant) await savePrice(priceList, variant.id, price);
      }

      return { action: "crear", label, message: describePlan(presentation, price) };
    }

    const input = productUpdateSchema.parse(compact(payload));
    const variant = presentation
      ? existing.variants.find((row) => row.presentation === presentation)
      : undefined;

    if (options.dryRun) {
      return {
        action: "actualizar",
        label,
        message: describePlan(presentation, price, Boolean(variant)),
      };
    }

    await updateProduct(existing.id, input);

    if (presentation && !variant) {
      const created = await addVariant(existing.id, {
        presentation,
        sku,
        active: true,
        price: isDefaultList ? price : undefined,
      });
      existing.variants.push({
        id: created.id,
        presentation: created.presentation,
        sku: created.sku,
      });

      if (price !== undefined && priceList && !isDefaultList) {
        await savePrice(priceList, created.id, price);
      }
    } else if (variant) {
      // Cambiar el SKU a mano es legítimo: hay quien migra con su propia
      // codificación y necesita conservarla.
      if (sku && sku !== variant.sku) {
        await updateVariant(variant.id, { sku });
        variant.sku = sku;
      }
      if (price !== undefined && priceList) {
        await savePrice(priceList, variant.id, price);
      }
    }

    return {
      action: "actualizar",
      label,
      message: describePlan(presentation, price, Boolean(variant)),
    };
  },
};

/** Resume en el informe qué se hace con la presentación y el precio. */
function describePlan(
  presentation: Presentation | undefined,
  price: number | undefined,
  variantExists = false,
): string | undefined {
  const parts: string[] = [];

  if (presentation) {
    parts.push(
      variantExists
        ? `presentación ${PRESENTATION_LABEL[presentation].toLowerCase()} ya existente`
        : `presentación ${PRESENTATION_LABEL[presentation].toLowerCase()}`,
    );
  } else {
    parts.push("sin presentación: todavía no se podrá vender");
  }

  if (price !== undefined) parts.push("con precio");

  return parts.join(" · ");
}
