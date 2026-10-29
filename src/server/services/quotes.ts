import { prisma } from "../db";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../errors";
import { OrderStatus, QuoteStatus, UserRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "../guards";
import { buildPriceResolver } from "./pricing";
import { createOrder } from "./orders";
import { lockKey } from "../locks";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import {
  discountLabel,
  discountPolicy,
  isDiscountAllowed,
} from "@/lib/quote-discount";
import { computeOrderTotals } from "@/lib/order-math";
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  applyPercentDiscount,
  canTransitionQuote,
} from "@/lib/quote-rules";
import { endOfBusinessDay } from "../validators/reports";
import type {
  QuoteConvertInput,
  QuoteCreateInput,
  QuoteListQuery,
  QuoteStatusChangeInput,
  QuoteUpdateInput,
} from "../validators/quotes";

/**
 * Cotizaciones: propuesta de precio previa al pedido.
 *
 * No reserva inventario. Los importes los calcula SIEMPRE el servidor con la
 * lista de precios del cliente y quedan congelados en la cotización; al
 * convertirla en pedido se respetan esos precios aunque la lista haya subido.
 */

// ─────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────

function quoteScope(user: SessionUser) {
  return user.role === UserRole.VENDEDOR ? { sellerId: user.id } : {};
}

function assertCanAccess(user: SessionUser, sellerId: string | null) {
  if (user.role === UserRole.VENDEDOR && sellerId !== user.id) {
    throw new ForbiddenError("Esta cotización no es tuya.");
  }
}

/**
 * Pasa a VENCIDA las enviadas cuya vigencia terminó. Se hace al consultar:
 * no hay tarea programada y así el estado que se ve nunca está desfasado.
 */
export async function expireOverdueQuotes(now: Date = new Date()) {
  const { count } = await prisma.quote.updateMany({
    where: { status: QuoteStatus.ENVIADA, validUntil: { lt: now } },
    data: { status: QuoteStatus.VENCIDA },
  });
  return count;
}

export async function listQuotes(user: SessionUser, query: QuoteListQuery) {
  await expireOverdueQuotes();

  const { search, status, clientId, sellerId, from, to, page, pageSize } = query;

  const where = {
    ...quoteScope(user),
    ...(status ? { status } : {}),
    ...(clientId ? { clientId } : {}),
    ...(sellerId && user.role !== UserRole.VENDEDOR ? { sellerId } : {}),
    ...(from || to
      ? {
          quoteDate: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: endOfBusinessDay(to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          client: {
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { tradeName: { contains: search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { quoteDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sequence: true,
        code: true,
        status: true,
        quoteDate: true,
        validUntil: true,
        total: true,
        client: { select: { id: true, businessName: true, tradeName: true } },
        seller: { select: { id: true, name: true } },
        legacySeller: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.quote.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getQuote(user: SessionUser, id: string) {
  await expireOverdueQuotes();

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          sequence: true,
          businessName: true,
          tradeName: true,
          nit: true,
          nitDv: true,
          phone: true,
          contacts: {
            where: { isPrimary: true, active: true },
            take: 1,
            select: { firstName: true, lastName: true, whatsapp: true, phone: true },
          },
        },
      },
      address: true,
      seller: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true, status: true } },
      items: {
        orderBy: { productNameSnapshot: "asc" },
        include: { variant: { select: { id: true, sku: true } } },
      },
    },
  });

  if (!quote) throw new NotFoundError("La cotización");
  assertCanAccess(user, quote.sellerId);

  return quote;
}

// ─────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────

/** Vigencia estándar a partir de `from`, hasta el final de ese día en Bogotá. */
function defaultValidUntil(from: Date): Date {
  const until = new Date(from);
  until.setUTCDate(until.getUTCDate() + DEFAULT_QUOTE_VALIDITY_DAYS);
  return endOfBusinessDay(until);
}

/** Resuelve precios, descuento e IVA y devuelve las líneas listas para guardar. */
async function buildQuoteItems(
  clientPriceListId: string | null,
  items: QuoteCreateInput["items"],
  discountPercent: number,
) {
  const variantIds = items.map((item) => item.variantId);

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, active: true },
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true, taxRate: true, active: true } },
    },
  });

  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const resolver = await buildPriceResolver(variantIds, clientPriceListId);

  const prepared = items.map((item) => {
    const variant = variantById.get(item.variantId);
    if (!variant || !variant.product.active) {
      throw new BusinessRuleError(
        "Uno de los productos de la cotización ya no está disponible.",
        { variantId: item.variantId },
      );
    }

    const unitPrice =
      item.unitPrice ?? resolver.unitPriceFor(item.variantId, item.quantity);

    if (unitPrice === null || unitPrice === undefined) {
      throw new BusinessRuleError(
        `${variant.product.name} no tiene precio en la lista "${resolver.priceListName}".`,
        { variantId: item.variantId },
      );
    }

    return {
      variantId: variant.id,
      productNameSnapshot: variant.product.name,
      skuSnapshot: variant.sku,
      presentationSnapshot: variant.presentation,
      quantity: item.quantity,
      unitPrice,
      discount: item.discount,
      taxRate: Number(variant.product.taxRate),
    };
  });

  // El descuento porcentual se reparte por línea antes de liquidar el IVA.
  const discounted = applyPercentDiscount(prepared, discountPercent);
  const totals = computeOrderTotals(discounted);

  return {
    totals,
    priceListId: resolver.priceListId,
    priceListName: resolver.priceListName,
    data: prepared.map((item, index) => ({
      ...item,
      discount: discounted[index].discount,
      subtotal: totals.lines[index].subtotal,
    })),
  };
}

async function loadClientForQuote(user: SessionUser, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      ownerId: true,
      status: true,
      priceListId: true,
      billingMode: true,
      negotiationFirstPct: true,
      negotiationNextPct: true,
      addresses: {
        where: { active: true },
        orderBy: { isPrimary: "desc" },
        select: { id: true },
      },
    },
  });

  if (!client) throw new NotFoundError("El cliente");

  if (user.role === UserRole.VENDEDOR && client.ownerId !== user.id) {
    throw new ForbiddenError("Este cliente no está en tu cartera.");
  }

  return client;
}

type ClientForQuote = Awaited<ReturnType<typeof loadClientForQuote>>;

/**
 * Descuento que corresponde a un cliente y una sede. "Primer pedido" cuenta
 * cotizaciones y pedidos previos (como el Histórico del cotizador), sin
 * contar la cotización que se está editando.
 */
async function resolveDiscountPolicy(
  client: ClientForQuote,
  addressId: string | undefined,
  excludeQuoteId?: string,
) {
  const notSelf = excludeQuoteId ? { id: { not: excludeQuoteId } } : {};
  const live = { status: { not: OrderStatus.CANCELADO } };

  const [clientQuotes, clientOrders, addressQuotes, addressOrders] = await Promise.all([
    prisma.quote.count({ where: { clientId: client.id, ...notSelf } }),
    prisma.order.count({ where: { clientId: client.id, ...live } }),
    addressId
      ? prisma.quote.count({ where: { clientId: client.id, addressId, ...notSelf } })
      : Promise.resolve(0),
    addressId
      ? prisma.order.count({ where: { clientId: client.id, addressId, ...live } })
      : Promise.resolve(0),
  ]);

  const clientHasHistory = clientQuotes + clientOrders > 0;
  // Sin sede indicada, "la sede" es el cliente entero.
  const addressHasHistory = addressId ? addressQuotes + addressOrders > 0 : clientHasHistory;

  return discountPolicy({
    negotiation:
      client.negotiationFirstPct !== null && client.negotiationNextPct !== null
        ? { first: client.negotiationFirstPct, next: client.negotiationNextPct }
        : null,
    clientHasHistory,
    addressHasHistory,
  });
}

/**
 * Valida el descuento pedido contra la política y devuelve el definitivo con
 * su rótulo. Un ADMIN puede salirse de los topes; un vendedor no.
 */
function settleDiscount(
  user: SessionUser,
  policy: ReturnType<typeof discountPolicy>,
  requested: number | undefined,
) {
  const pct = requested ?? policy.suggested;

  if (!isDiscountAllowed(policy, pct)) {
    if (user.role !== UserRole.ADMIN) {
      const hint =
        "only" in policy.allowed
          ? policy.allowed.only.map((value) => `${value} %`).join(" o ")
          : `de ${policy.allowed.min} a ${policy.allowed.max} %`;
      throw new BusinessRuleError(
        `El descuento de ${pct} % no está permitido para este cliente (${hint}).`,
      );
    }
    return { pct, label: discountLabel("MANUAL", pct) };
  }

  return {
    pct,
    label: discountLabel(policy.kind, pct, { firstOfAddress: policy.firstOfAddress }),
  };
}

/**
 * Descuento que el formulario debe mostrar al elegir cliente y sede: el
 * propuesto, qué valores admite y el rótulo que quedará en la cotización.
 */
export async function getQuoteDiscountPolicy(
  user: SessionUser,
  clientId: string,
  addressId?: string,
) {
  const client = await loadClientForQuote(user, clientId);
  const policy = await resolveDiscountPolicy(client, addressId ?? client.addresses[0]?.id);

  return {
    kind: policy.kind,
    suggested: policy.suggested,
    allowed: policy.allowed,
    label: discountLabel(policy.kind, policy.suggested, {
      firstOfAddress: policy.firstOfAddress,
    }),
  };
}

/**
 * Número de cotización COT-AAAAMMDD-NNN: consecutivo del día en Bogotá. Se
 * toma el mayor del día y se suma uno, bajo candado del día, para que dos
 * asesores cotizando a la vez no repitan número.
 */
async function nextQuoteCode(tx: Prisma.TransactionClient, date: Date): Promise<string> {
  const local = new TZDate(date, BUSINESS_TIME_ZONE);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  const stamp = `${local.getFullYear()}${pad(local.getMonth() + 1)}${pad(local.getDate())}`;
  const prefix = `COT-${stamp}-`;

  await lockKey(tx, `quote-code:${stamp}`);

  const last = await tx.quote.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.slice(prefix.length)) || 0 : 0;

  return `${prefix}${pad(lastNumber + 1, 3)}`;
}

export async function createQuote(user: SessionUser, input: QuoteCreateInput) {
  const client = await loadClientForQuote(user, input.clientId);

  const addressId = input.addressId ?? client.addresses[0]?.id;
  if (addressId && !client.addresses.some((a) => a.id === addressId)) {
    throw new BusinessRuleError("La sede no pertenece a este cliente.");
  }

  const policy = await resolveDiscountPolicy(client, addressId);
  const discount = settleDiscount(user, policy, input.discountPercent);

  const { totals, data, priceListId, priceListName } = await buildQuoteItems(
    client.priceListId,
    input.items,
    discount.pct,
  );

  const quoteDate = new Date();

  return prisma.$transaction(async (tx) => {
    const code = await nextQuoteCode(tx, quoteDate);

    return tx.quote.create({
      data: {
        code,
        clientId: client.id,
        addressId,
        sellerId: user.id,
        quoteDate,
        validUntil: input.validUntil ?? defaultValidUntil(quoteDate),
        priceListId,
        priceListName,
        billingMode: input.billingMode ?? client.billingMode,
        discountPercent: discount.pct,
        discountLabel: discount.label,
        notes: input.notes,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        items: { create: data },
      },
      include: { items: true },
    });
  });
}

/** Solo se puede editar el contenido mientras la cotización sea BORRADOR. */
export async function updateQuote(
  user: SessionUser,
  id: string,
  input: QuoteUpdateInput,
) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sellerId: true,
      clientId: true,
      addressId: true,
      discountPercent: true,
    },
  });

  if (!quote) throw new NotFoundError("La cotización");
  assertCanAccess(user, quote.sellerId);

  if (quote.status !== QuoteStatus.BORRADOR) {
    throw new BusinessRuleError(
      "Solo se puede modificar una cotización en borrador. Emite una nueva.",
    );
  }

  const header = {
    validUntil: input.validUntil,
    billingMode: input.billingMode,
    notes: input.notes,
  };

  // Solo cabecera: ni líneas, ni sede, ni descuento. Si cambia alguno, hay
  // que recalcular y se exigen las líneas.
  if (!input.items) {
    if (input.discountPercent !== undefined || input.addressId !== undefined) {
      throw new BusinessRuleError(
        "Para cambiar la sede o el descuento envía también los productos.",
      );
    }

    return prisma.quote.update({ where: { id }, data: header, include: { items: true } });
  }

  const client = await loadClientForQuote(user, quote.clientId);
  const addressId = input.addressId ?? quote.addressId ?? undefined;
  if (addressId && !client.addresses.some((a) => a.id === addressId)) {
    throw new BusinessRuleError("La sede no pertenece a este cliente.");
  }

  const policy = await resolveDiscountPolicy(client, addressId, id);
  const discount = settleDiscount(
    user,
    policy,
    input.discountPercent ?? Number(quote.discountPercent),
  );

  const { totals, data, priceListId, priceListName } = await buildQuoteItems(
    client.priceListId,
    input.items,
    discount.pct,
  );

  return prisma.$transaction(async (tx) => {
    await tx.quoteItem.deleteMany({ where: { quoteId: id } });

    return tx.quote.update({
      where: { id },
      data: {
        ...header,
        addressId,
        priceListId,
        priceListName,
        discountPercent: discount.pct,
        discountLabel: discount.label,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        items: { create: data },
      },
      include: { items: true },
    });
  });
}

export async function changeQuoteStatus(
  user: SessionUser,
  id: string,
  input: QuoteStatusChangeInput,
) {
  await expireOverdueQuotes();

  const quote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true, status: true, sellerId: true },
  });

  if (!quote) throw new NotFoundError("La cotización");
  assertCanAccess(user, quote.sellerId);

  if (quote.status === input.status) return quote;

  // Aceptar pasa por `convertQuoteToOrder`: aceptar sin pedido dejaría una
  // cotización cerrada que nadie sabe cómo se atendió.
  if (input.status === QuoteStatus.ACEPTADA) {
    throw new BusinessRuleError(
      "Una cotización se acepta convirtiéndola en pedido.",
    );
  }

  if (!canTransitionQuote(quote.status, input.status)) {
    throw new BusinessRuleError(
      `No se puede pasar una cotización de "${quote.status}" a "${input.status}".`,
    );
  }

  if (input.status === QuoteStatus.RECHAZADA && !input.reason) {
    throw new BusinessRuleError("Indica el motivo del rechazo.");
  }

  const now = new Date();

  return prisma.quote.update({
    where: { id },
    data: {
      status: input.status,
      // Enviar (o reenviar una vencida) abre una vigencia nueva.
      ...(input.status === QuoteStatus.ENVIADA
        ? { sentAt: now, validUntil: defaultValidUntil(now) }
        : {}),
      ...(input.status === QuoteStatus.RECHAZADA
        ? { respondedAt: now, rejectReason: input.reason }
        : {}),
    },
  });
}

/**
 * Convierte la cotización en un pedido en BORRADOR con los precios ya
 * pactados. El pedido pasa por `createOrder`, así que respeta las mismas
 * reglas (cartera, cliente suspendido, sede).
 */
export async function convertQuoteToOrder(
  user: SessionUser,
  id: string,
  input: QuoteConvertInput,
) {
  await expireOverdueQuotes();

  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { items: true, seller: { select: { active: true } } },
  });

  if (!quote) throw new NotFoundError("La cotización");
  assertCanAccess(user, quote.sellerId);

  if (quote.orderId) {
    throw new BusinessRuleError("Esta cotización ya se convirtió en pedido.");
  }
  if (
    quote.status !== QuoteStatus.BORRADOR &&
    quote.status !== QuoteStatus.ENVIADA
  ) {
    throw new BusinessRuleError(
      "Solo se convierte una cotización en borrador o enviada y vigente.",
    );
  }

  const order = await createOrder(user, {
    clientId: quote.clientId,
    addressId: quote.addressId ?? undefined,
    channel: "WHATSAPP",
    requestedDeliveryDate: input.requestedDeliveryDate,
    // La venta es de quien cotizó, aunque la convierta un ADMIN. Si ya no
    // está activo, decide `createOrder` (el responsable del cliente).
    sellerId:
      user.role !== UserRole.VENDEDOR && quote.seller?.active
        ? (quote.sellerId ?? undefined)
        : undefined,
    notes: [`Desde la cotización ${quote.code}`, quote.notes]
      .filter(Boolean)
      .join(" — "),
    items: quote.items.map((item) => ({
      variantId: item.variantId,
      quantity: Number(item.quantity),
      // Precio y descuento congelados en la cotización.
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
    })),
  });

  // Se reclama la cotización con una condición: si dos personas convierten a
  // la vez, solo una se queda con ella y la otra deshace su pedido.
  const claimed = await prisma.quote.updateMany({
    where: { id, orderId: null },
    data: {
      status: QuoteStatus.ACEPTADA,
      respondedAt: new Date(),
      orderId: order.id,
    },
  });

  if (claimed.count === 0) {
    await prisma.order.delete({ where: { id: order.id } });
    throw new BusinessRuleError("Esta cotización ya se convirtió en pedido.");
  }

  return order;
}
