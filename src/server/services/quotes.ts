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
import { changeOrderStatus, createOrder, resolveOrderSeller } from "./orders";
import { assertClientNotBlocked } from "./receivables";
import { lockKey } from "../locks";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import {
  discountLabel,
  discountPolicy,
  isDiscountAllowed,
} from "@/lib/quote-discount";
import { computeOrderTotals } from "@/lib/order-math";
import { applyPercentDiscount, canTransitionQuote } from "@/lib/quote-rules";
import { QUOTE_STATUS_LABEL } from "@/lib/labels";
import { calculateNitDv } from "@/lib/nit";
import { nextDeliveryDay } from "@/lib/delivery-zones";
import { todayInBogota } from "./routes";
import { contactWhatsappKey } from "@/lib/whatsapp";
import { endOfBusinessDay } from "../validators/reports";
import type {
  NewClientInput,
  QuoteCreateInput,
  QuoteListQuery,
  QuoteStatusChangeInput,
} from "../validators/quotes";

/**
 * Cotizaciones: al guardarse crean el pedido y reservan inventario.
 *
 * Los importes los calcula SIEMPRE el servidor con la
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

export async function listQuotes(user: SessionUser, query: QuoteListQuery) {
  const { search, status, clientId, sellerId, day, page, pageSize } = query;
  const from = day ?? query.from;
  const to = day ?? query.to;

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
        isNewClient: true,
        address: { select: { locality: true } },
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
      baseOrderCount: true,
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
  // Una cotización anulada no cuenta: devolvió el pedido y el inventario.
  const liveQuote = { status: { not: QuoteStatus.ANULADO }, ...notSelf };

  const [clientOrders, clientQuotes, addressQuotes, addressOrders] = await Promise.all([
    prisma.order.count({ where: { clientId: client.id, ...live } }),
    prisma.quote.count({ where: { clientId: client.id, ...liveQuote } }),
    addressId
      ? prisma.quote.count({ where: { clientId: client.id, addressId, ...liveQuote } })
      : Promise.resolve(0),
    addressId
      ? prisma.order.count({ where: { clientId: client.id, addressId, ...live } })
      : Promise.resolve(0),
  ]);

  // Solo es "cliente nuevo" (15 % fijo) quien nunca ha cotizado ni pedido. Un
  // cliente actual —con cotizaciones o pedidos, incluido el histórico— nunca
  // recibe la promo: va de 0 a 8 % o por su negociación especial.
  // El historial de antes del CRM (corte de la base maestra) también cuenta.
  const hadSalesBeforeCrm = client.baseOrderCount > 0;
  const clientHasHistory = clientOrders > 0 || clientQuotes > 0 || hadSalesBeforeCrm;
  // Sin sede indicada, "la sede" es el cliente entero.
  const addressHasHistory = addressId
    ? addressQuotes + addressOrders > 0 || hadSalesBeforeCrm
    : clientHasHistory;

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
 * su rótulo. Los topes no se saltan.
 */
function settleDiscount(
  policy: ReturnType<typeof discountPolicy>,
  requested: number | undefined,
) {
  const pct = requested ?? policy.suggested;

  // La promo de primer pedido no se quita ni se combina, tampoco por un ADMIN.
  if (policy.fixed && pct !== policy.suggested) {
    throw new BusinessRuleError(
      `Cliente nuevo: el primer pedido lleva ${policy.suggested} % de descuento, sin excepción ni otros descuentos.`,
    );
  }

  // Los topes valen para todos, también para un ADMIN: un cliente actual lleva
  // de 0 a 8 % (o el de su negociación especial); el 15 % es solo del nuevo.
  if (!isDiscountAllowed(policy, pct)) {
    const hint =
      "only" in policy.allowed
        ? policy.allowed.only.map((value) => `${value} %`).join(" o ")
        : `de ${policy.allowed.min} a ${policy.allowed.max} %`;
    throw new BusinessRuleError(
      `El descuento de ${pct} % no está permitido para este cliente (${hint}).`,
    );
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
    fixed: policy.fixed,
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

/**
 * Crea el cliente nuevo que viene en la cotización, con sus sedes y el contacto
 * de cada una. Queda como prospecto del asesor. La forma de facturación y la
 * lista de precios las elige quien cotiza (lo pide el formulario de cliente
 * nuevo), a diferencia de la ficha, donde solo las cambia un ADMIN.
 */
async function createQuoteClient(sellerId: string, input: NewClientInput) {
  if (input.nit) {
    const taken = await prisma.client.findUnique({ where: { nit: input.nit }, select: { id: true } });
    if (taken) {
      throw new BusinessRuleError("Ya existe un cliente con esa cédula o NIT: búscalo como cliente actual.");
    }
  }
  if (input.deliveryAddressIndex >= input.addresses.length) {
    throw new BusinessRuleError("Elige la sede a la que va este pedido.");
  }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        businessName: input.businessName,
        nit: input.nit,
        nitDv: input.nit ? calculateNitDv(input.nit) : undefined,
        phone: input.phone,
        email: input.email,
        type: input.type,
        priceListId: input.priceListId,
        billingMode: input.billingMode,
        notes: input.notes,
        ownerId: sellerId,
        status: "ACTIVO",
      },
      select: { id: true },
    });

    const addressIds: string[] = [];
    for (const [index, sede] of input.addresses.entries()) {
      const [firstName, ...rest] = sede.contactName.split(/\s+/);
      const created = await tx.clientAddress.create({
        data: {
          clientId: client.id,
          label: sede.label ?? (input.addresses.length > 1 ? `Sede ${index + 1}` : "Principal"),
          address: sede.address,
          neighborhood: sede.neighborhood,
          locality: sede.locality,
          isPrimary: index === 0,
        },
        select: { id: true },
      });
      addressIds.push(created.id);
      await tx.contact.create({
        data: {
          clientId: client.id,
          firstName,
          lastName: rest.join(" ") || undefined,
          whatsapp: sede.whatsapp,
          whatsappE164: contactWhatsappKey({ whatsapp: sede.whatsapp, phone: null }) ?? undefined,
          isPrimary: index === 0,
        },
      });
    }

    return { clientId: client.id, addressId: addressIds[input.deliveryAddressIndex] };
  });
}

/**
 * Guarda la cotización y crea el pedido en el mismo acto: el pedido queda
 * CONFIRMADO y reserva el inventario por FEFO. La cotización nace "Pendiente
 * por facturar"; anularla cancela el pedido y devuelve el inventario.
 */
export async function createQuote(user: SessionUser, input: QuoteCreateInput) {
  let clientId = input.clientId;
  let addressId = input.addressId;
  let createdClientId: string | null = null;
  let isNewClient = false;

  if (input.newClient) {
    // Asesor de la venta: se resuelve antes de crear al cliente, que le pertenece.
    const sellerId = await resolveOrderSeller(user, input.sellerId, null);
    const created = await createQuoteClient(sellerId, input.newClient);
    clientId = created.clientId;
    addressId = created.addressId;
    createdClientId = created.clientId;
    isNewClient = true;
  }

  try {
    const client = await loadClientForQuote(user, clientId!);
    // Mora crítica: no se cotiza hasta que pague (un ADMIN puede autorizarlo).
    await assertClientNotBlocked(user, client.id);

    addressId = addressId ?? client.addresses[0]?.id;
    if (addressId && !client.addresses.some((a) => a.id === addressId)) {
      throw new BusinessRuleError("La sede no pertenece a este cliente.");
    }

    const policy = await resolveDiscountPolicy(client, addressId);
    isNewClient = isNewClient || policy.kind === "NUEVO";
    const discount = settleDiscount(policy, input.discountPercent);

    const sellerId = await resolveOrderSeller(user, input.sellerId, client.ownerId);
    const { totals, data, priceListId, priceListName } = await buildQuoteItems(
      client.priceListId,
      input.items,
      discount.pct,
    );

    // El pedido: mismos precios y descuentos que la cotización, y reserva de
    // inventario. Si no alcanza el stock, falla antes de guardar la cotización.
    const order = await createOrder(user, {
      clientId: client.id,
      addressId,
      channel: "WHATSAPP",
      sellerId,
      notes: input.notes,
      // Pedido de hoy, se entrega el siguiente día hábil.
      requestedDeliveryDate: new Date(`${nextDeliveryDay(todayInBogota())}T00:00:00.000Z`),
      items: data.map((item) => ({
        variantId: item.variantId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
      })),
    });

    try {
      await changeOrderStatus(user, order.id, { status: OrderStatus.CONFIRMADO });
    } catch (error) {
      await prisma.order.delete({ where: { id: order.id } });
      throw error;
    }

    const quoteDate = new Date();

    try {
      const quote = await prisma.$transaction(async (tx) => {
        const code = await nextQuoteCode(tx, quoteDate);

        return tx.quote.create({
          data: {
            code,
            clientId: client.id,
            addressId,
            sellerId,
            quoteDate,
            status: QuoteStatus.PENDIENTE_FACTURAR,
            isNewClient,
            orderId: order.id,
            priceListId,
            priceListName,
            // La forma de facturación es la del cliente.
            billingMode: client.billingMode,
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

      // Con su primera cotización un prospecto pasa a ser cliente.
      if (client.status === "PROSPECTO") {
        await prisma.client.update({ where: { id: client.id }, data: { status: "ACTIVO" } });
      }

      return quote;
    } catch (error) {
      // Sin cotización no debe quedar un pedido reservando inventario.
      await changeOrderStatus(user, order.id, {
        status: OrderStatus.CANCELADO,
        reason: "No se pudo guardar la cotización",
      });
      throw error;
    }
  } catch (error) {
    // Un cliente nuevo sin cotización ni pedidos no debe quedar a medias.
    if (createdClientId) {
      await prisma.client.delete({ where: { id: createdClientId } }).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Cambia el estado contable. Solo un ADMIN: contabilidad es quien factura.
 * Anular cancela el pedido de la cotización y devuelve el inventario.
 */
export async function changeQuoteStatus(
  user: SessionUser,
  id: string,
  input: QuoteStatusChangeInput,
) {
  if (user.role !== UserRole.ADMIN) {
    throw new ForbiddenError("Solo un administrador cambia el estado de la cotización.");
  }

  const quote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true, status: true, orderId: true },
  });
  if (!quote) throw new NotFoundError("La cotización");

  if (quote.status === input.status) return quote;

  if (!canTransitionQuote(quote.status, input.status)) {
    throw new BusinessRuleError(
      `No se puede pasar una cotización de "${QUOTE_STATUS_LABEL[quote.status]}" a "${QUOTE_STATUS_LABEL[input.status]}".`,
    );
  }

  if (input.status === QuoteStatus.ANULADO) {
    if (!input.reason) throw new BusinessRuleError("Indica el motivo de la anulación.");

    if (quote.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: quote.orderId },
        select: { status: true },
      });
      if (order && order.status !== OrderStatus.CANCELADO) {
        // Devuelve el inventario reservado; falla si el pedido ya salió a ruta.
        await changeOrderStatus(user, quote.orderId, {
          status: OrderStatus.CANCELADO,
          reason: `Cotización anulada: ${input.reason}`,
        });
      }
    }
  }

  return prisma.quote.update({
    where: { id },
    data: {
      status: input.status,
      respondedAt: new Date(),
      rejectReason: input.status === QuoteStatus.ANULADO ? input.reason : null,
    },
  });
}
