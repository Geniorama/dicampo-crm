import { BUSINESS_TIME_ZONE, formatCOP } from "@/lib/format";
import {
  ORDER_CHANNEL_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_TERMS_LABEL,
  PRESENTATION_LABEL,
} from "@/lib/labels";
import { parseBoolean, parseDecimal } from "@/lib/import/values";
import { TZDate } from "@date-fns/tz";
import { prisma } from "../../db";
import { BusinessRuleError, NotFoundError, ValidationError } from "../../errors";
import {
  importHistoricalOrder,
  prepareHistoricalOrder,
} from "../../services/orders";
import { historicalOrderSchema } from "../../validators/orders";
import {
  loadClientIndex,
  loadUserIndex,
  loadVariantIndex,
  requireClient,
  resolveUser,
  resolveVariant,
  type ClientIndex,
  type UserIndex,
  type VariantIndex,
} from "../context";
import {
  comparisonKey,
  dateValue,
  decimal,
  digits,
  enumValue,
  requiredText,
  text,
} from "../helpers";
import type { GroupImporter, NumberedRecord, ProcessOptions, RowResult } from "../runner";

/**
 * Carga masiva de pedidos históricos: ventas que ya ocurrieron.
 *
 * Cada fila es un renglón; las filas con el mismo número de pedido forman un
 * pedido. Entran ENTREGADAS, con su vendedor, sus precios y lo cobrado, y no
 * descuentan inventario. Solo crea: un número ya cargado se omite, así que
 * volver a subir el archivo (por ejemplo, si se cortó a mitad) es seguro.
 */

type Ctx = {
  clients: ClientIndex;
  variants: VariantIndex;
  users: UserIndex;
  /** Números ya cargados, de la base y de unidades anteriores del lote. */
  seen: Set<string>;
};

/**
 * Una fecha del archivo es un día, pero el pedido guarda un momento: se toma
 * el mediodía de Bogotá, para que el pedido del día 1 no se lea en el mes
 * anterior desde un servidor en UTC.
 */
function businessNoon(day: Date): Date {
  return new TZDate(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    12,
    0,
    BUSINESS_TIME_ZONE,
  );
}

/** "Sí" = todo pagado, "No" = nada, un número = lo abonado. */
function paidAmount(raw: string | undefined): number | "TOTAL" | undefined {
  if (raw === undefined) return undefined;

  const asBoolean = parseBoolean(raw);
  if (asBoolean !== null) return asBoolean ? "TOTAL" : 0;

  const key = comparisonKey(raw);
  if (key === "pagado" || key === "total" || key === "completo") return "TOTAL";
  if (key === "pendiente" || key === "debe") return 0;

  const amount = parseDecimal(raw);
  if (amount === null) {
    throw new ValidationError(`Pagado: no se entiende «${raw}». Escribe Sí, No o el valor abonado.`);
  }
  return amount;
}

/** Primer valor no vacío del campo entre las filas del pedido. */
function firstText(rows: NumberedRecord[], key: string): string | undefined {
  for (const { record } of rows) {
    const value = text(record, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Un dato de cabecera que cambia entre renglones es un error del archivo. */
function assertSame(rows: NumberedRecord[], key: string, label: string): void {
  const values = new Set(
    rows.map(({ record }) => comparisonKey(text(record, key))).filter(Boolean),
  );
  if (values.size > 1) {
    throw new ValidationError(
      `${label}: los renglones de este pedido no coinciden (filas ${rows.map((row) => row.line).join(", ")}).`,
    );
  }
}

export const ordersImporter: GroupImporter<Ctx> = {
  groupBy: "externalRef",
  unit: { one: "pedido", many: "pedidos" },

  async load(records) {
    const refs = [
      ...new Set(records.map((record) => text(record, "externalRef")).filter(Boolean)),
    ] as string[];

    const [clients, variants, users, existing] = await Promise.all([
      loadClientIndex(),
      loadVariantIndex(),
      loadUserIndex({ includeInactive: true }),
      refs.length > 0
        ? prisma.order.findMany({
            where: { externalRef: { in: refs } },
            select: { externalRef: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      clients,
      variants,
      users,
      seen: new Set(existing.map((order) => comparisonKey(order.externalRef))),
    };
  },

  async processGroup(
    rows: NumberedRecord[],
    ctx: Ctx,
    options: ProcessOptions,
  ): Promise<RowResult> {
    const head = rows[0].record;
    const externalRef = requiredText(head, "externalRef", "Número de pedido");

    for (const [key, label] of [
      ["clientNit", "NIT del cliente"],
      ["clientName", "Cliente"],
      ["orderDate", "Fecha del pedido"],
      ["seller", "Vendedor"],
    ] as const) {
      assertSame(rows, key, label);
    }

    const client = requireClient(ctx.clients, {
      nit: digits(firstText(rows, "clientNit")),
      name: firstText(rows, "clientName"),
    });
    const label = `Pedido ${externalRef} · ${client.businessName}`;

    if (ctx.seen.has(comparisonKey(externalRef))) {
      return { action: "omitir", label, message: "Ese número de pedido ya estaba cargado." };
    }

    const orderDay = dateValue(head, "orderDate", "Fecha del pedido");
    if (!orderDay) throw new ValidationError("Fecha del pedido: es obligatoria.");
    const deliveredRow = rows.find(({ record }) => text(record, "deliveredAt"))?.record ?? head;
    const deliveredDay = dateValue(deliveredRow, "deliveredAt", "Fecha de entrega");

    const sellerRaw = firstText(rows, "seller");
    const seller = resolveUser(ctx.users, sellerRaw);

    // Sede por nombre dentro del cliente; sin ella, la principal.
    let addressId: string | undefined;
    const addressRaw = firstText(rows, "address");
    if (addressRaw) {
      const addresses = await prisma.clientAddress.findMany({
        where: { clientId: client.id },
        select: { id: true, label: true, address: true },
      });
      const match = addresses.filter(
        (address) =>
          comparisonKey(address.label) === comparisonKey(addressRaw) ||
          comparisonKey(address.address) === comparisonKey(addressRaw),
      );
      if (match.length === 0) throw new NotFoundError(`La sede "${addressRaw}" de ${client.businessName}`);
      if (match.length > 1) {
        throw new BusinessRuleError(`Hay varias sedes "${addressRaw}" en ${client.businessName}.`);
      }
      addressId = match[0].id;
    }

    const items = rows.map(({ line, record }) => {
      try {
        const variant = resolveVariant(ctx.variants, {
          sku: text(record, "sku"),
          flavor: text(record, "flavor"),
          presentation: enumValue(record, "presentation", PRESENTATION_LABEL, "Presentación"),
        });
        const quantity = decimal(record, "quantity", "Cantidad");
        if (quantity === undefined) throw new ValidationError("Cantidad: es obligatoria.");
        return {
          variantId: variant.id,
          quantity,
          unitPrice: decimal(record, "unitPrice", "Precio unitario"),
          discount: decimal(record, "discount", "Descuento del renglón") ?? 0,
        };
      } catch (error) {
        // En un pedido de varias filas, decir cuál falló ahorra buscarla.
        if (rows.length > 1 && error instanceof Error) {
          error.message = `Fila ${line}: ${error.message}`;
        }
        throw error;
      }
    });

    const paid = paidAmount(firstText(rows, "paid"));
    const orderDate = businessNoon(orderDay);

    const input = historicalOrderSchema.parse({
      externalRef,
      clientId: client.id,
      addressId,
      sellerId: seller?.id,
      channel: enumValue(head, "channel", ORDER_CHANNEL_LABEL, "Canal"),
      paymentTerms: enumValue(head, "paymentTerms", PAYMENT_TERMS_LABEL, "Condición de pago"),
      orderDate,
      deliveredAt: deliveredDay ? businessNoon(deliveredDay) : orderDate,
      notes: firstText(rows, "notes"),
      items,
      // "Todo" se resuelve al conocer el total, que lo calcula el servidor.
      paidAmount: paid === "TOTAL" ? undefined : paid,
      paymentMethod: enumValue(head, "paymentMethod", PAYMENT_METHOD_LABEL, "Medio de pago"),
    });

    // La simulación recorre las mismas validaciones; solo no escribe.
    const prepared = options.dryRun
      ? await prepareHistoricalOrder(options.user, input)
      : null;
    const order = options.dryRun ? null : await importHistoricalOrder(options.user, input);

    ctx.seen.add(comparisonKey(externalRef));

    const total = prepared ? prepared.totals.total : Number(order!.total);
    const paidValue = prepared ? prepared.paid : (input.paidAmount ?? total);
    const sellerName = seller?.name ?? "responsable del cliente";

    return {
      action: "crear",
      label,
      message: [
        `${items.length} ${items.length === 1 ? "producto" : "productos"}`,
        formatCOP(total),
        sellerName,
        paidValue >= total ? "pagado" : `debe ${formatCOP(total - paidValue)}`,
      ].join(" · "),
    };
  },
};
