import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
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

/**
 * Carga el histórico de cotizaciones del Excel comercial (hoja "Histórico")
 * como cotizaciones del CRM.
 *
 * Escribe directo con Prisma, a diferencia de la carga masiva, a propósito:
 * es una migración de datos pasados y debe conservar los precios y
 * descuentos de entonces. `services/quotes.ts` los recalcularía con la lista
 * de precios de hoy.
 *
 * Por defecto solo informa. Escribe únicamente con `--aplicar`. Es
 * idempotente: una cotización se identifica por su código (`code`) y
 * no se vuelve a crear.
 *
 *   npx tsx scripts/importar-cotizaciones.ts ruta/Base_Comercial.xlsx
 *   npx tsx scripts/importar-cotizaciones.ts ruta/Base_Comercial.xlsx --aplicar
 *   ... --aplicar --crear-clientes     # los clientes que no existan entran como PROSPECTO
 *
 * El Excel no dice si la cotización se aceptó, así que entran como VENCIDA
 * (sin respuesta registrada). Si ya hubo pedido, el pedido manda.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const FILE = args.find((arg) => !arg.startsWith("--"));
const APPLY = args.includes("--aplicar");
const CREATE_CLIENTS = args.includes("--crear-clientes");

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** ExcelJS devuelve fórmulas y textos enriquecidos como objetos. */
function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result;
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value;
}

async function readRows(path: string): Promise<LegacyRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = workbook.getWorksheet("Histórico");
  if (!sheet) throw new Error('El libro no tiene la hoja "Histórico".');

  let headers: string[] | null = null;
  const rows: LegacyRow[] = [];

  sheet.eachRow((excelRow) => {
    const values = (excelRow.values as ExcelJS.CellValue[]).slice(1).map(cellValue);

    if (!headers) {
      // La hoja trae filas de título antes del encabezado real.
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
  });

  if (!headers) throw new Error('No se encontró la fila de encabezados ("N° Cotización").');
  return rows;
}

async function main() {
  if (!FILE) {
    console.error("Uso: npx tsx scripts/importar-cotizaciones.ts <archivo.xlsx> [--aplicar] [--crear-clientes]");
    process.exit(1);
  }

  const { quotes, skippedRows } = groupLegacyQuotes(await readRows(FILE));
  console.log(`${quotes.length} cotizaciones leídas (${skippedRows} filas descartadas).`);

  // ── Catálogo, usuarios y clientes existentes ───────────────
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
  const userByFirstName = new Map(
    users.map((user) => [normalizeName(user.name.split(" ")[0]), user.id]),
  );

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      nit: true,
      businessName: true,
      tradeName: true,
      ownerId: true,
      contacts: { select: { whatsappE164: true } },
      addresses: { where: { isPrimary: true }, select: { id: true }, take: 1 },
    },
  });
  const byNit = new Map(clients.filter((c) => c.nit).map((c) => [c.nit!, c]));
  const byName = new Map<string, (typeof clients)[number]>();
  const byPhone = new Map<string, (typeof clients)[number]>();
  for (const client of clients) {
    byName.set(normalizeName(client.businessName), client);
    if (client.tradeName) byName.set(normalizeName(client.tradeName), client);
    for (const contact of client.contacts) {
      if (contact.whatsappE164) byPhone.set(contact.whatsappE164, client);
    }
  }

  const priceLists = await prisma.priceList.findMany({ select: { id: true, name: true } });
  const priceListByName = new Map(priceLists.map((list) => [normalizeName(list.name), list.id]));

  const existing = new Set(
    (
      await prisma.quote.findMany({
        where: { code: { startsWith: "COT-" } },
        select: { code: true },
      })
    ).map((quote) => quote.code),
  );

  // ── Diagnóstico y escritura ────────────────────────────────
  const stats = { created: 0, existing: 0, noClient: 0, noFlavor: 0, createdClients: 0 };
  const missingFlavors = new Map<string, number>();
  const unknownAdvisors = new Map<string, number>();
  const missingClients = new Map<string, number>();
  const totalMismatches: string[] = [];

  for (const quote of quotes) {
    if (existing.has(quote.code)) {
      stats.existing += 1;
      continue;
    }

    const unmatched = quote.lines.filter((line) => !variantByLine(line.flavor));
    if (unmatched.length > 0) {
      stats.noFlavor += 1;
      for (const line of unmatched) {
        missingFlavors.set(line.flavor, (missingFlavors.get(line.flavor) ?? 0) + 1);
      }
      continue;
    }

    if (!totalsAgree(quote)) totalMismatches.push(quote.code);

    const phoneKey = quote.phoneDigits ? contactWhatsappKey({ phone: quote.phoneDigits }) : null;
    let client =
      (quote.nitDigits && byNit.get(quote.nitDigits)) ||
      (phoneKey && byPhone.get(phoneKey)) ||
      byName.get(normalizeName(quote.client)) ||
      null;

    const sellerId = userByFirstName.get(normalizeName(quote.advisor)) ?? null;
    if (!sellerId && quote.advisor) {
      unknownAdvisors.set(quote.advisor, (unknownAdvisors.get(quote.advisor) ?? 0) + 1);
    }

    if (!client) {
      if (!CREATE_CLIENTS) {
        stats.noClient += 1;
        missingClients.set(quote.client, (missingClients.get(quote.client) ?? 0) + 1);
        continue;
      }
      if (!APPLY) {
        stats.createdClients += 1;
        stats.created += 1;
        continue;
      }
      const created = await prisma.client.create({
        data: {
          businessName: quote.client,
          nit: quote.nitDigits && !byNit.has(quote.nitDigits) ? quote.nitDigits : undefined,
          email: quote.email || undefined,
          phone: quote.phoneDigits || undefined,
          ownerId: sellerId,
          notes: "Creado al importar el histórico de cotizaciones.",
        },
        select: { id: true, nit: true, businessName: true, tradeName: true, ownerId: true, contacts: true, addresses: true },
      });
      client = { ...created, contacts: [], addresses: [] };
      byName.set(normalizeName(created.businessName), client);
      if (created.nit) byNit.set(created.nit, client);
      stats.createdClients += 1;
    }

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

    stats.created += 1;
    if (!APPLY) continue;

    await prisma.quote.create({
      data: {
        code: quote.code,
        clientId: client.id,
        addressId: client.addresses[0]?.id,
        sellerId,
        legacySeller: sellerId ? null : quote.advisor || null,
        status: "VENCIDA",
        quoteDate: quote.date,
        priceListId: priceListByName.get(normalizeName(quote.priceTier)),
        priceListName: quote.priceTier || null,
        billingMode: quote.billing,
        discountPercent: quote.discountPercent,
        discountLabel: quote.discountLabel || null,
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        notes: [quote.contact && `Contacto: ${quote.contact}`, quote.address && `Dirección: ${quote.address}`]
          .filter(Boolean)
          .join(" · ") || null,
        items: {
          create: lines.map((line, index) => ({
            variantId: line.variant.id,
            productNameSnapshot: line.variant.product.name,
            skuSnapshot: line.variant.sku,
            presentationSnapshot: line.variant.presentation,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: discounted[index].discount,
            taxRate: line.taxRate,
            subtotal: totals.lines[index].subtotal,
          })),
        },
      },
    });
  }

  // ── Informe ────────────────────────────────────────────────
  console.log(APPLY ? "\nEscrito:" : "\nSimulación (nada se escribió):");
  console.log(`  Cotizaciones por crear:        ${stats.created}`);
  console.log(`  Ya importadas (se saltan):     ${stats.existing}`);
  console.log(`  Sin cliente en el CRM:         ${stats.noClient}`);
  console.log(`  Con sabores fuera de catálogo: ${stats.noFlavor}`);
  if (CREATE_CLIENTS) console.log(`  Clientes nuevos:               ${stats.createdClients}`);

  const printTop = (title: string, map: Map<string, number>) => {
    if (map.size === 0) return;
    console.log(`\n${title}`);
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .forEach(([name, count]) => console.log(`  ${count.toString().padStart(4)}  ${name}`));
  };

  printTop("Sabores que no están en el catálogo (agrégalos y vuelve a correr):", missingFlavors);
  printTop('Asesores sin usuario (quedan como texto en "legacySeller"):', unknownAdvisors);
  printTop("Clientes sin coincidencia (usa --crear-clientes para crearlos):", missingClients);

  if (totalMismatches.length > 0) {
    console.log(
      `\n${totalMismatches.length} cotizaciones donde el total del Excel no cuadra con sus líneas y descuento:`,
    );
    console.log("  " + totalMismatches.slice(0, 20).join(", ") + (totalMismatches.length > 20 ? ", …" : ""));
  }

  if (!APPLY) console.log("\nAgrega --aplicar para escribir.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
