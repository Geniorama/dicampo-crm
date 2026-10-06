import { PRESENTATION_LABEL } from "@/lib/labels";
import { formatCOP } from "@/lib/format";
import { prisma } from "../../db";
import { ValidationError } from "../../errors";
import { bulkUpdatePrices } from "../../services/pricing";
import {
  loadPriceListIndex,
  loadVariantIndex,
  resolvePriceList,
  resolveVariant,
  type PriceListIndex,
  type VariantIndex,
} from "../context";
import {
  decimal,
  enumValue,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de precios.
 *
 * Es la forma práctica de aplicar un ajuste de lista: se exporta, se cambia
 * la columna en la hoja y se vuelve a subir. Lo que ya se vendió no se toca
 * —cada pedido guarda el precio con el que se tomó—, así que subir una lista
 * nueva no reescribe la historia.
 */

type Ctx = { variants: VariantIndex; priceLists: PriceListIndex };

export const pricesImporter: Importer<Ctx> = {
  async load() {
    const [variants, priceLists] = await Promise.all([
      loadVariantIndex(),
      loadPriceListIndex(),
    ]);

    return { variants, priceLists };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const variant = resolveVariant(ctx.variants, {
      sku: text(record, "sku"),
      flavor: text(record, "flavor"),
      presentation: enumValue(
        record,
        "presentation",
        PRESENTATION_LABEL,
        "Presentación",
      ),
    });

    const label = `${variant.productName} (${variant.sku})`;

    const price = decimal(record, "price", "Precio");
    if (price === undefined) {
      throw new ValidationError("Precio: es obligatorio y la celda viene vacía.");
    }
    if (price < 0) {
      throw new ValidationError("Precio: no puede ser negativo.");
    }

    // El escalón por volumen; sin columna, el precio base.
    const minQty = decimal(record, "minQty", "Cantidad mínima") ?? 1;
    if (minQty <= 0) {
      throw new ValidationError("Cantidad mínima: debe ser mayor que cero.");
    }

    const priceList = resolvePriceList(ctx.priceLists, text(record, "priceListName"));

    const existing = await prisma.priceListItem.findUnique({
      where: {
        priceListId_variantId_minQty: {
          priceListId: priceList.id,
          variantId: variant.id,
          minQty,
        },
      },
      select: { id: true, price: true },
    });

    if (existing && options.mode === "crear") {
      return {
        action: "omitir",
        label,
        message: `Ya tiene precio en ${priceList.name}.`,
      };
    }
    if (!existing && options.mode === "actualizar") {
      return {
        action: "omitir",
        label,
        message: `Todavía no tiene precio en ${priceList.name}.`,
      };
    }

    if (!options.dryRun) {
      await bulkUpdatePrices({
        priceListId: priceList.id,
        items: [{ variantId: variant.id, price, minQty }],
      });
    }

    const detail = existing
      ? `${formatCOP(existing.price)} → ${formatCOP(price)}`
      : formatCOP(price);

    return {
      action: existing ? "actualizar" : "crear",
      label,
      message: `${priceList.name}: ${detail}${minQty > 1 ? ` (desde ${minQty})` : ""}`,
    };
  },
};
