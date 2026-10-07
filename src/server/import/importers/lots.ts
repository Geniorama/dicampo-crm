import { PRESENTATION_LABEL } from "@/lib/labels";
import { formatCalendarDate, formatQuantity } from "@/lib/format";
import { prisma } from "../../db";
import { BusinessRuleError, ValidationError } from "../../errors";
import { registerLot } from "../../services/inventory";
import { lotCreateSchema } from "../../validators/inventory";
import {
  loadVariantIndex,
  resolveVariant,
  type VariantIndex,
} from "../context";
import {
  comparisonKey,
  dateValue,
  decimal,
  enumValue,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de lotes: la entrada de producción de un día, o el inventario
 * inicial al arrancar con el CRM.
 *
 * Solo crea. Un lote ya registrado no se reescribe porque su saldo no es un
 * dato editable: es el resultado del kardex — entradas, salidas por venta,
 * ajustes y mermas. Cambiar la cantidad por archivo dejaría el inventario
 * diciendo una cosa y la auditoría otra.
 */

type Ctx = {
  variants: VariantIndex;
  /** Lotes ya vistos, de la base y de filas anteriores del mismo archivo. */
  seen: Set<string>;
};

function lotKey(variantId: string, lotCode: string): string {
  return `${variantId}|${comparisonKey(lotCode)}`;
}

export const lotsImporter: Importer<Ctx> = {
  async load() {
    const [variants, lots] = await Promise.all([
      loadVariantIndex(),
      prisma.lot.findMany({ select: { variantId: true, lotCode: true } }),
    ]);

    return {
      variants,
      seen: new Set(lots.map((lot) => lotKey(lot.variantId, lot.lotCode))),
    };
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

    const lotCode = requiredText(record, "lotCode", "Código de lote");
    const label = `${lotCode} · ${variant.productName}`;

    const key = lotKey(variant.id, lotCode);
    if (ctx.seen.has(key)) {
      return {
        action: "omitir",
        label,
        message: "Ese lote ya está registrado para este producto.",
      };
    }

    const productionDate = dateValue(record, "productionDate", "Fecha de producción");
    const expiryDate = dateValue(record, "expiryDate", "Fecha de vencimiento");
    const quantity = decimal(record, "quantity", "Cantidad");

    if (!productionDate) {
      throw new ValidationError("Fecha de producción: es obligatoria.");
    }
    if (!expiryDate) {
      throw new ValidationError("Fecha de vencimiento: es obligatoria.");
    }
    if (quantity === undefined) {
      throw new ValidationError("Cantidad: es obligatoria.");
    }

    // Se comprueba aquí, y no solo en el servicio, para que el error salga en
    // la simulación: es el tipo de fallo que viene repetido en media hoja.
    if (expiryDate <= productionDate) {
      throw new BusinessRuleError(
        "El vencimiento debe ser posterior a la fecha de producción.",
      );
    }

    const input = lotCreateSchema.parse({
      variantId: variant.id,
      lotCode,
      productionDate,
      expiryDate,
      quantity,
      notes: text(record, "notes"),
    });

    if (!options.dryRun) {
      await registerLot(options.user, input);
    }

    ctx.seen.add(key);

    return {
      action: "crear",
      label,
      message: `${formatQuantity(quantity)} · vence ${formatCalendarDate(expiryDate)}`,
    };
  },
};
