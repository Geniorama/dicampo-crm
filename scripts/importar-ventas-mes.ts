import "dotenv/config";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/guards";
import { allocateFefo } from "../src/lib/fefo";
import { recordPayment } from "../src/server/services/receivables";
import { refreshClientSalesStats } from "../src/server/services/client-sales";
import {
  flavorKey,
  groupLegacyQuotes,
  legacyProduct,
  totalsAgree,
  variantKey,
  type LegacyRow,
} from "../src/lib/legacy-quotes";
import { computeOrderTotals } from "../src/lib/order-math";
import { applyPercentDiscount } from "../src/lib/quote-rules";
import { contactWhatsappKey } from "../src/lib/whatsapp";
import { calculateNitDv } from "../src/lib/nit";

/**
 * Carga las ventas del mes (hoja "Ventas": una fila por línea de producto)
 * como cotizaciones con su pedido: ENTREGADO, pagado y con el inventario
 * descontado por FEFO. Respeta los precios y descuentos del archivo (no los
 * recalcula con la lista de hoy).
 *
 * - El asesor de cada cotización queda como vendedor del pedido, así que
 *   cuenta para sus ventas y metas. "Naturaleza = Cliente nuevo" marca la
 *   cotización como de cliente nuevo (suma a la meta de clientes nuevos).
 * - Si algún sabor no alcanza en inventario, NO escribe nada y lo informa.
 * - Idempotente: una cotización ya cargada (por su código) se salta.
 * - Por defecto solo simula. Escribe únicamente con `--aplicar`.
 *
 *   npx tsx scripts/importar-ventas-mes.ts "Ventas Dicampo - noviembre 2026.xlsx"
 *   npx tsx scripts/importar-ventas-mes.ts "Ventas Dicampo - noviembre 2026.xlsx" --aplicar
 */

const args = process.argv.slice(2);
const FILE = args.find((arg) => !arg.startsWith("--"));
const APPLY = args.includes("--aplicar");

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const DEFICIT_LOT = "SIN-INVENTARIO";

/**
 * Como `allocateStockForOrder`, pero tolera la falta de existencias (acordado
 * con Oscar para esta carga): descuenta por FEFO lo que haya y el faltante lo
 * carga a un lote AGOTADO "SIN-INVENTARIO" por variante, que queda en negativo
 * y deja el kardex trazable. Al cargar el inventario real se compensa con un
 * ajuste. Un lote en negativo no entra en la rotación FEFO (no está DISPONIBLE).
 */
async function allocateAllowingDeficit(tx: Tx, orderId: string, userId: string, when: Date) {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    select: { variantId: true, quantity: true },
  });
  for (const item of items) {
    const lots = await tx.lot.findMany({
      where: { variantId: item.variantId, status: "DISPONIBLE", quantityAvailable: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
      select: { id: true, quantityAvailable: true },
    });
    const { allocations, shortfall } = allocateFefo(
      lots.map((lot) => ({ id: lot.id, available: Number(lot.quantityAvailable) })),
      Number(item.quantity),
    );
    for (const allocation of allocations) {
      await tx.lot.update({
        where: { id: allocation.lotId },
        data: {
          quantityAvailable: allocation.remaining,
          ...(allocation.remaining === 0 ? { status: "AGOTADO" } : {}),
        },
      });
      await tx.stockMovement.create({
        data: {
          type: "SALIDA_VENTA",
          variantId: item.variantId,
          lotId: allocation.lotId,
          quantity: -allocation.taken,
          orderId,
          userId,
          reason: "Confirmación de pedido",
        },
      });
    }
    if (shortfall > 0) {
      const deficit = await tx.lot.upsert({
        where: { variantId_lotCode: { variantId: item.variantId, lotCode: DEFICIT_LOT } },
        create: {
          variantId: item.variantId,
          lotCode: DEFICIT_LOT,
          productionDate: when,
          expiryDate: when,
          quantityInitial: 0,
          quantityAvailable: 0,
          status: "AGOTADO",
          notes: "Ventas cargadas sin existencias registradas (carga de noviembre). Saldo negativo = pendiente de inventario real.",
        },
        update: {},
      });
      await tx.lot.update({
        where: { id: deficit.id },
        data: { quantityAvailable: { decrement: shortfall } },
      });
      await tx.stockMovement.create({
        data: {
          type: "SALIDA_VENTA",
          variantId: item.variantId,
          lotId: deficit.id,
          quantity: -shortfall,
          orderId,
          userId,
          reason: "Venta sin existencias registradas (carga de noviembre)",
        },
      });
    }
  }
}

const norm = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value;
}

/**
 * Algunos libros traen comentarios con la relación mal enlazada y ExcelJS no
 * los abre. Los comentarios no son datos: se quitan antes de leer.
 */
async function loadWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/(comments|drawings)\//.test(name) || /^xl\/worksheets\/_rels\//.test(name)) {
      zip.remove(name);
    }
  }
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    zip.file(name, xml.replace(/<legacyDrawing[^>]*\/>/g, ""));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await zip.generateAsync({ type: "nodebuffer" })) as unknown as ArrayBuffer);
  return workbook;
}

type Extra = {
  nature: string;
  locality: string;
  neighborhood: string;
  zone: string;
  branch: string;
  unified: string;
};

async function readRows(path: string) {
  const workbook = await loadWorkbook(path);
  const sheet = workbook.getWorksheet("Ventas") ?? workbook.worksheets[0];

  let headers: string[] | null = null;
  const rows: LegacyRow[] = [];
  const extras = new Map<string, Extra>();

  sheet.eachRow((excelRow) => {
    const values = (excelRow.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
    if (!headers) {
      if (String(values[0] ?? "").trim() === "N° Cotización") {
        headers = values.map((value) => String(value ?? "").trim());
      }
      return;
    }
    const row: LegacyRow = {};
    headers.forEach((header, index) => {
      if (header) row[header] = values[index];
    });
    rows.push(row);

    const code = String(row["N° Cotización"] ?? "").trim();
    if (code && !extras.has(code)) {
      const text = (key: string) => {
        const value = String(row[key] ?? "").trim();
        return value === "null" ? "" : value;
      };
      extras.set(code, {
        nature: text("Naturaleza"),
        locality: text("Localidad"),
        neighborhood: text("Barrio"),
        zone: text("Zona / Ruta"),
        branch: text("Sede"),
        unified: text("Cliente unificado"),
      });
    }
  });

  if (!headers) throw new Error('No se encontró la fila de encabezados ("N° Cotización").');
  return { rows, extras };
}

async function main() {
  if (!FILE) {
    console.error('Uso: npx tsx scripts/importar-ventas-mes.ts "<archivo.xlsx>" [--aplicar]');
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Base: ${url.host}${url.pathname}  (${APPLY ? "ESCRIBE" : "simulación"})\n`);

  const { rows, extras } = await readRows(FILE);
  const { quotes, skippedRows } = groupLegacyQuotes(rows);
  console.log(`${quotes.length} cotizaciones leídas (${skippedRows} filas descartadas).`);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin) throw new Error("No hay un usuario ADMIN activo en esta base.");
  const actor: SessionUser = admin;

  // ── Catálogo, asesores, clientes y listas ─────────────────
  const variants = await prisma.productVariant.findMany({
    where: { active: true },
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true, flavor: true, taxRate: true } },
    },
  });
  const variantByFlavor = new Map(
    variants.map((v) => [variantKey(flavorKey(v.product.flavor), v.presentation), v]),
  );
  const variantByLine = (legacyName: string) => {
    const { flavorKey: flavor, presentation } = legacyProduct(legacyName);
    return variantByFlavor.get(variantKey(flavor, presentation));
  };

  const users = await prisma.user.findMany({
    where: { role: { in: ["VENDEDOR", "ADMIN"] } },
    select: { id: true, name: true },
  });
  const userByFirstName = new Map(users.map((u) => [norm(u.name.split(" ")[0]), u.id]));

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      nit: true,
      businessName: true,
      tradeName: true,
      ownerId: true,
      contacts: { select: { whatsappE164: true } },
      addresses: { where: { active: true }, orderBy: { isPrimary: "desc" }, select: { id: true } },
    },
  });
  type ClientRef = (typeof clients)[number];
  const byNit = new Map<string, ClientRef>(clients.filter((c) => c.nit).map((c) => [c.nit!, c]));
  const byName = new Map<string, ClientRef>();
  const byPhone = new Map<string, ClientRef>();
  for (const client of clients) {
    byName.set(norm(client.businessName), client);
    if (client.tradeName) byName.set(norm(client.tradeName), client);
    for (const contact of client.contacts) {
      if (contact.whatsappE164) byPhone.set(contact.whatsappE164, client);
    }
  }

  const priceLists = await prisma.priceList.findMany({
    select: { id: true, name: true, isDefault: true },
  });
  const priceListByName = new Map(priceLists.map((l) => [norm(l.name), l.id]));
  const defaultListId = (priceLists.find((l) => l.isDefault) ?? priceLists[0])?.id;
  const zones = await prisma.deliveryZone.findMany({ select: { id: true, name: true } });
  const zoneByName = new Map(zones.map((z) => [norm(z.name), z.id]));

  const existingCodes = new Set(
    (await prisma.quote.findMany({ select: { code: true } })).map((q) => q.code),
  );

  // ── Diagnóstico ───────────────────────────────────────────
  const missingFlavors = new Map<string, number>();
  const unknownAdvisors = new Map<string, number>();
  const mismatches: string[] = [];
  const toCreate = quotes.filter((q) => !existingCodes.has(q.code));
  const ready = [];
  let newClients = 0;
  let matchedClients = 0;

  for (const quote of toCreate) {
    const unmatched = quote.lines.filter((line) => !variantByLine(line.flavor));
    if (unmatched.length > 0) {
      for (const line of unmatched) {
        missingFlavors.set(line.flavor, (missingFlavors.get(line.flavor) ?? 0) + 1);
      }
      continue;
    }
    if (!totalsAgree(quote)) {
      mismatches.push(quote.code);
      continue;
    }
    const sellerId = userByFirstName.get(norm(quote.advisor)) ?? null;
    if (!sellerId) {
      unknownAdvisors.set(quote.advisor, (unknownAdvisors.get(quote.advisor) ?? 0) + 1);
      continue;
    }
    const phoneKey = quote.phoneDigits ? contactWhatsappKey({ phone: quote.phoneDigits }) : null;
    const extra = extras.get(quote.code);
    const found =
      (quote.nitDigits && byNit.get(quote.nitDigits)) ||
      (phoneKey && byPhone.get(phoneKey)) ||
      byName.get(norm(quote.client)) ||
      (extra?.unified ? byName.get(norm(extra.unified)) : undefined) ||
      null;
    if (found) matchedClients += 1;
    else newClients += 1;
    ready.push({ quote, sellerId, found, extra });
  }

  // Inventario: lo que piden las cotizaciones listas contra lo disponible.
  const needed = new Map<string, { units: number; label: string }>();
  for (const { quote } of ready) {
    for (const line of quote.lines) {
      const variant = variantByLine(line.flavor)!;
      const entry = needed.get(variant.id) ?? {
        units: 0,
        label: `${variant.product.name} (${variant.presentation})`,
      };
      entry.units += line.kilos;
      needed.set(variant.id, entry);
    }
  }
  const lots = await prisma.lot.groupBy({
    by: ["variantId"],
    where: { status: "DISPONIBLE", quantityAvailable: { gt: 0 } },
    _sum: { quantityAvailable: true },
  });
  const availableByVariant = new Map(lots.map((l) => [l.variantId, Number(l._sum.quantityAvailable)]));
  const shortages = [...needed.entries()]
    .map(([id, entry]) => ({ ...entry, available: availableByVariant.get(id) ?? 0 }))
    .filter((row) => row.units > row.available)
    .sort((a, b) => b.units - b.available - (a.units - a.available));

  const report = () => {
    const top = (title: string, map: Map<string, number>) => {
      if (map.size === 0) return;
      console.log(`\n${title}`);
      [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n}  ${k}`));
    };
    console.log(`\nPor cargar: ${ready.length} cotizaciones (${toCreate.length} nuevas, ${quotes.length - toCreate.length} ya cargadas).`);
    console.log(`  Clientes existentes: ${matchedClients} · clientes por crear: ${newClients}`);
    top("Sabores fuera del catálogo (esas cotizaciones NO se cargan):", missingFlavors);
    top("Asesores sin usuario (esas cotizaciones NO se cargan):", unknownAdvisors);
    if (mismatches.length > 0) {
      console.log(`\nTotal del Excel que no cuadra con sus líneas (NO se cargan): ${mismatches.join(", ")}`);
    }
    if (shortages.length > 0) {
      console.log("\nINVENTARIO INSUFICIENTE (no se escribe nada hasta resolverlo):");
      for (const row of shortages) {
        console.log(`  ${row.label}: piden ${row.units}, hay ${row.available}`);
      }
    }
  };
  report();

  if (!APPLY) {
    console.log("\nAgrega --aplicar para escribir.");
    return;
  }
  if (shortages.length > 0) {
    console.log(
      "\nInventario insuficiente: se descuenta lo que haya por FEFO y el resto queda en negativo (lote SIN-INVENTARIO).",
    );
  }
  if (missingFlavors.size > 0 || unknownAdvisors.size > 0 || mismatches.length > 0) {
    console.log("\nSe cargan solo las cotizaciones completas; el resto queda pendiente.");
  }

  // ── Escritura ─────────────────────────────────────────────
  const touched = new Set<string>();
  let written = 0;

  for (const { quote, sellerId, found, extra } of ready.sort((a, b) => a.quote.code.localeCompare(b.quote.code))) {
    let client = found;
    const isNewClient = norm(extra?.nature ?? "") === "cliente nuevo";

    if (!client) {
      const isSuper = norm(extra?.nature ?? "") === "super distribuidor";
      const created = await prisma.client.create({
        data: {
          businessName: quote.client,
          nit: quote.nitDigits && !byNit.has(quote.nitDigits) ? quote.nitDigits : undefined,
          nitDv: quote.nitDigits && !byNit.has(quote.nitDigits) ? (calculateNitDv(quote.nitDigits) ?? undefined) : undefined,
          status: "ACTIVO",
          type: "OTRO",
          email: quote.email.includes("@") ? quote.email : undefined,
          phone: quote.phoneDigits || undefined,
          ownerId: sellerId,
          billingMode: quote.billing,
          isSuperDistributor: isSuper,
          priceListId: priceListByName.get(norm(quote.priceTier)) ?? defaultListId,
          relationStatus: "ACTIVO",
          notes: "Creado al cargar las ventas de noviembre.",
          addresses: quote.address.length >= 5
            ? {
                create: {
                  label: extra?.branch || "Sede principal",
                  address: quote.address.slice(0, 200),
                  neighborhood: extra?.neighborhood || undefined,
                  locality: extra?.locality || undefined,
                  zoneId: extra?.zone ? zoneByName.get(norm(extra.zone)) : undefined,
                  isPrimary: true,
                },
              }
            : undefined,
        },
        select: {
          id: true, nit: true, businessName: true, tradeName: true, ownerId: true,
          addresses: { select: { id: true } },
        },
      });
      client = { ...created, contacts: [] };
      byName.set(norm(created.businessName), client);
      if (created.nit) byNit.set(created.nit, client);
    }
    const clientId = client.id;

    const lines = quote.lines.map((line) => {
      const variant = variantByLine(line.flavor)!;
      return {
        variant,
        quantity: line.kilos,
        unitPrice: line.unitPrice,
        discount: 0,
        taxRate: Number(variant.product.taxRate),
      };
    });
    const discounted = applyPercentDiscount(lines, quote.discountPercent);
    const totals = computeOrderTotals(discounted);
    const itemData = lines.map((line, index) => ({
      variantId: line.variant.id,
      productNameSnapshot: line.variant.product.name,
      skuSnapshot: line.variant.sku,
      presentationSnapshot: line.variant.presentation,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: discounted[index].discount,
      taxRate: line.taxRate,
      subtotal: totals.lines[index].subtotal,
    }));
    const addressId = client.addresses[0]?.id;
    const calendarDay = new Date(Date.UTC(
      quote.date.getUTCFullYear(), quote.date.getUTCMonth(), quote.date.getUTCDate(),
    ));

    await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            clientId,
            addressId,
            sellerId,
            channel: "WHATSAPP",
            status: "ENTREGADO",
            orderDate: quote.date,
            confirmedAt: quote.date,
            deliveredAt: quote.date,
            stockAppliedAt: quote.date,
            requestedDeliveryDate: calendarDay,
            paymentTerms: "CONTADO",
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
            notes: `Carga de ventas de noviembre (${quote.code}).`,
            items: { create: itemData },
          },
        });

        await allocateAllowingDeficit(tx, order.id, actor.id, quote.date);

        await tx.quote.create({
          data: {
            code: quote.code,
            clientId,
            addressId,
            sellerId,
            quoteDate: quote.date,
            status: "PENDIENTE_FACTURAR",
            isNewClient,
            orderId: order.id,
            priceListId: priceListByName.get(norm(quote.priceTier)),
            priceListName: quote.priceTier || null,
            billingMode: quote.billing,
            discountPercent: quote.discountPercent,
            discountLabel: quote.discountLabel || null,
            subtotal: totals.subtotal,
            discount: totals.discount,
            tax: totals.tax,
            total: totals.total,
            notes: [quote.contact && `Contacto: ${quote.contact}`, quote.address && `Dirección: ${quote.address}`]
              .filter(Boolean).join(" · ") || null,
            items: { create: itemData },
          },
        });

        if (totals.total > 0) {
          await recordPayment(tx, actor, order.id, {
            amount: totals.total,
            method: "OTRO",
            paidAt: quote.date,
            reference: "Carga de ventas de noviembre",
          });
        }
      },
      { timeout: 60_000, maxWait: 20_000 },
    );

    touched.add(clientId);
    written += 1;
    if (written % 25 === 0) console.log(`  … ${written}/${ready.length}`);
  }

  for (const id of touched) await refreshClientSalesStats(id);
  console.log(`\nEscrito: ${written} cotizaciones con su pedido entregado y pagado.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
