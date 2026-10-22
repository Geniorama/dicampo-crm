import { formatCOP, formatQuantity } from "@/lib/format";
import { prisma } from "../../db";
import { ValidationError } from "../../errors";
import { createPurchase } from "../../services/purchases";
import { purchaseCreateSchema } from "../../validators/purchases";
import {
  comparisonKey,
  dateValue,
  decimal,
  requiredText,
  text,
  type RowRecord,
} from "../helpers";
import type { Importer, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de compras de fruta: el historial de compras al arrancar, o las
 * de la semana en una sola hoja.
 *
 * Solo crea. Una compra es un hecho que ya ocurrió: reescribirla por archivo
 * movería el costo de la fruta —y con él la rentabilidad de meses pasados—
 * sin dejar rastro. Para que subir dos veces el mismo archivo no duplique el
 * gasto, una compra idéntica (misma fecha, fruta, proveedor, kilos y costo) se
 * omite.
 */

type Ctx = {
  /** Compras ya vistas, de la base y de filas anteriores del mismo archivo. */
  seen: Set<string>;
};

function purchaseKey(parts: {
  date: Date;
  fruit: string;
  supplier: string;
  kg: number;
  baseCost: number;
}): string {
  return [
    parts.date.toISOString().slice(0, 10),
    comparisonKey(parts.fruit),
    comparisonKey(parts.supplier),
    Number(parts.kg).toFixed(3),
    Number(parts.baseCost).toFixed(2),
  ].join("|");
}

export const purchasesImporter: Importer<Ctx> = {
  async load() {
    const purchases = await prisma.fruitPurchase.findMany({
      select: { date: true, fruit: true, supplier: true, kg: true, baseCost: true },
    });

    return {
      seen: new Set(
        purchases.map((purchase) =>
          purchaseKey({
            date: purchase.date,
            fruit: purchase.fruit,
            supplier: purchase.supplier,
            kg: Number(purchase.kg),
            baseCost: Number(purchase.baseCost),
          }),
        ),
      ),
    };
  },

  async process(
    record: RowRecord,
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const fruit = requiredText(record, "fruit", "Fruta");
    const supplier = requiredText(record, "supplier", "Proveedor");
    const date = dateValue(record, "date", "Fecha");
    const kg = decimal(record, "kg", "Kilos");
    const baseCost = decimal(record, "baseCost", "Costo del lote");

    if (!date) throw new ValidationError("Fecha: es obligatoria.");
    if (kg === undefined) throw new ValidationError("Kilos: es obligatorio.");
    if (baseCost === undefined) throw new ValidationError("Costo del lote: es obligatorio.");

    const label = `${fruit} · ${supplier}`;

    // Se valida siempre, también en simulación: que los errores salgan antes de escribir.
    const input = purchaseCreateSchema.parse({
      date,
      fruit,
      supplier,
      kg,
      baseCost,
      notes: text(record, "notes"),
    });

    const key = purchaseKey({ date: input.date, fruit, supplier, kg: input.kg, baseCost: input.baseCost });
    if (ctx.seen.has(key)) {
      return {
        action: "omitir",
        label,
        message: "Ya hay una compra idéntica registrada.",
      };
    }

    if (!options.dryRun) {
      await createPurchase(options.user, input);
    }

    ctx.seen.add(key);

    return {
      action: "crear",
      label,
      message: `${formatQuantity(input.kg)} kg · ${formatCOP(input.baseCost)}`,
    };
  },
};
