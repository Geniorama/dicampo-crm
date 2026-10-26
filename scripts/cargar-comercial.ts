import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { flavorKey, legacyProduct, variantKey } from "../src/lib/legacy-quotes";

/**
 * Carga la configuración comercial de la hoja "Config" del Excel comercial
 * (Base_Comercial_Dicampo.xlsx), que el cotizador de Apps Script leía:
 *
 *   1. Lista de precios de cada cliente (columna "tipo de cliente" de la tabla
 *      de clientes; si falta, la de su cotización más reciente).
 *   2. Negociación especial "X-Y" por cliente (columna "Negociación").
 *   3. Listas de Super distribuidor (tabla bajo el título "SUPER DIS…") y su
 *      asignación al cliente del mismo nombre.
 *
 * Nunca pisa lo que ya tiene valor: un cliente con lista o negociación se
 * deja igual, y una lista de precios existente solo recibe los precios que le
 * faltan. Por defecto simula; escribe únicamente con `--aplicar`. Usa Prisma
 * directo, como `importar-cotizaciones.ts`: es una carga de datos de arranque.
 *
 *   npx tsx scripts/cargar-comercial.ts ruta/Base_Comercial.xlsx
 *   npx tsx scripts/cargar-comercial.ts ruta/Base_Comercial.xlsx --aplicar
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const FILE = args.find((arg) => !arg.startsWith("--"));
const APPLY = args.includes("--aplicar");

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9ñÑ ]+/g, " ")
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
const text = (cell: ExcelJS.Cell) => String(cellValue(cell.value) ?? "").trim();

/** Columnas de la tabla de clientes de "Config" (T en adelante, fila 1 = encabezados). */
const COL = { name: 20, tier: 27, branch: 29, negotiation: 30 } as const;

/** "15-5", "´15-10", o la fecha en que Sheets convirtió "15-10" → "X-Y". */
function parseNegotiation(raw: unknown): [number, number] | null {
  if (raw instanceof Date) return [raw.getUTCDate(), raw.getUTCMonth() + 1];
  const match = /(\d{1,2})\D+(\d{1,2})/.exec(String(raw ?? ""));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

async function main() {
  if (!FILE) {
    console.error("Uso: npx tsx scripts/cargar-comercial.ts <archivo.xlsx> [--aplicar]");
    process.exit(1);
  }
  console.log(`Base: ${new URL(process.env.DATABASE_URL ?? "").host}${APPLY ? "  (ESCRIBE)" : "  (simulación)"}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const config = workbook.getWorksheet("Config");
  if (!config) throw new Error('El libro no tiene la hoja "Config".');

  const clients = await prisma.client.findMany({
    select: {
      id: true,
      businessName: true,
      tradeName: true,
      priceListId: true,
      negotiationFirstPct: true,
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { priceListId: true },
      },
    },
  });
  const clientByName = new Map<string, (typeof clients)[number]>();
  for (const client of clients) {
    clientByName.set(normalize(client.businessName), client);
    if (client.tradeName) clientByName.set(normalize(client.tradeName), client);
  }

  const lists = await prisma.priceList.findMany({ select: { id: true, name: true } });
  const listByName = new Map(lists.map((list) => [normalize(list.name), list.id]));
  const generalLists = new Set(["distribuidor", "mayorista", "publico general"]);

  // ── 1. Lista de precios por cliente ─────────────────────────
  console.log("\n1. Lista de precios de cada cliente");
  const tierByClient = new Map<string, string>();
  for (let r = 2; r <= config.rowCount; r++) {
    const row = config.getRow(r);
    const tier = normalize(text(row.getCell(COL.tier)));
    const client = clientByName.get(normalize(text(row.getCell(COL.name))));
    if (client && generalLists.has(tier) && !tierByClient.has(client.id)) tierByClient.set(client.id, tier);
  }

  const listUpdates: { clientId: string; listId: string; source: string }[] = [];
  let withoutTier = 0;
  for (const client of clients) {
    if (client.priceListId) continue;
    const fromSheet = tierByClient.get(client.id);
    const sheetListId = fromSheet ? listByName.get(fromSheet) : undefined;
    const quoteListId = client.quotes[0]?.priceListId;
    const listId = sheetListId ?? quoteListId ?? undefined;
    if (!listId) {
      withoutTier += 1;
      continue;
    }
    listUpdates.push({ clientId: client.id, listId, source: sheetListId ? "Config" : "última cotización" });
  }
  const bySource = (source: string) => listUpdates.filter((u) => u.source === source).length;
  console.log(`  asignar: ${listUpdates.length} (Config: ${bySource("Config")}, última cotización: ${bySource("última cotización")})`);
  console.log(`  sin dato para asignar: ${withoutTier} (quedan sin lista)`);

  // ── 2. Negociación especial ─────────────────────────────────
  console.log("\n2. Negociación especial");
  const negotiationUpdates: { clientId: string; first: number; next: number; label: string }[] = [];
  const negotiationMissing: string[] = [];
  const negotiationSeen = new Map<string, string>();
  for (let r = 2; r <= config.rowCount; r++) {
    const row = config.getRow(r);
    const parsed = parseNegotiation(cellValue(row.getCell(COL.negotiation).value));
    if (!parsed) continue;

    const name = text(row.getCell(COL.name));
    const branch = text(row.getCell(COL.branch));
    const client = clientByName.get(normalize(name));
    if (!client) {
      negotiationMissing.push(`${name}${branch ? ` (${branch})` : ""} ${parsed.join("-")}`);
      continue;
    }

    const label = `${parsed[0]}-${parsed[1]}`;
    const previous = negotiationSeen.get(client.id);
    if (previous && previous !== label) {
      console.log(`  ! ${name}: sedes con negociaciones distintas (${previous} y ${label}); se usa ${previous}.`);
      continue;
    }
    if (previous) continue; // misma negociación en otra sede: ya está
    negotiationSeen.set(client.id, label);

    if (client.negotiationFirstPct !== null) continue;
    negotiationUpdates.push({ clientId: client.id, first: parsed[0], next: parsed[1], label: `${client.businessName} → ${label}` });
  }
  negotiationUpdates.forEach((u) => console.log(`  + ${u.label}`));
  negotiationMissing.forEach((line) => console.log(`  ? sin cliente en el CRM: ${line}`));

  // ── 3. Listas de Super distribuidor ─────────────────────────
  console.log("\n3. Listas de Super distribuidor");
  let titleRow = 0;
  for (let r = 1; r <= 200; r++) {
    if (text(config.getCell(r, 1)).toUpperCase().includes("SUPER DIS")) {
      titleRow = r;
      break;
    }
  }
  if (!titleRow) throw new Error('No encontré el título "SUPER DIS…" en la hoja Config.');

  const headerRow = config.getRow(titleRow + 1);
  const superColumns: { name: string; col: number }[] = [];
  for (let c = 2; c <= 11; c++) {
    const name = text(headerRow.getCell(c));
    // Una columna con solo un número es un contador de filas, no un cliente.
    if (name && !/^\d+$/.test(name)) superColumns.push({ name, col: c });
  }

  const variants = await prisma.productVariant.findMany({
    where: { active: true },
    select: { id: true, product: { select: { flavor: true } }, presentation: true },
  });
  const variantByLegacy = new Map(
    variants.map((v) => [variantKey(flavorKey(v.product.flavor), v.presentation), v.id]),
  );

  /**
   * El cliente de una lista: nombre exacto o, si no, el único cliente cuyo
   * nombre empieza por el de la columna ("FRUPULPAS" → "FRUPULPAS SAS"). Si
   * hay varios no se adivina: la lista queda sin asignar.
   */
  const SUPER_ALIASES: Record<string, string> = { "dany llanos": "dani llanos" };
  const findSuperClient = (columnName: string) => {
    const key = normalize(columnName);
    const exact = clientByName.get(key);
    if (exact) return exact;
    const prefix = SUPER_ALIASES[key] ?? key;
    const candidates = new Map(
      [...clientByName.entries()]
        .filter(([name]) => name === prefix || name.startsWith(`${prefix} `))
        .map(([, client]) => [client.id, client]),
    );
    return candidates.size === 1 ? [...candidates.values()][0] : undefined;
  };

  const products: { name: string; prices: Map<number, number> }[] = [];
  for (let r = titleRow + 2; r <= config.rowCount; r++) {
    const name = text(config.getCell(r, 1));
    if (!name) break;
    const prices = new Map<number, number>();
    for (const { col } of superColumns) {
      const price = Number(cellValue(config.getCell(r, col).value)) || 0;
      if (price > 0) prices.set(col, price);
    }
    products.push({ name, prices });
  }

  const unmatchedProducts = new Set<string>();
  const superLists: { name: string; items: { variantId: string; price: number }[]; clientId?: string }[] = [];
  for (const { name, col } of superColumns) {
    const items: { variantId: string; price: number }[] = [];
    for (const product of products) {
      const price = product.prices.get(col);
      if (!price) continue;
      const { flavorKey: flavor, presentation } = legacyProduct(product.name);
      const variantId = variantByLegacy.get(variantKey(flavor, presentation));
      if (!variantId) {
        unmatchedProducts.add(product.name);
        continue;
      }
      items.push({ variantId, price });
    }
    const client = findSuperClient(name);
    superLists.push({ name, items, clientId: client?.id });
    console.log(
      `  ${name}: ${items.length} precios · cliente: ${client ? client.businessName : "sin cliente con ese nombre (la lista queda sin asignar)"}`,
    );
  }
  if (unmatchedProducts.size > 0) {
    console.log(`  Productos de la hoja sin variante en el CRM (se omiten): ${[...unmatchedProducts].join(", ")}`);
  }

  // ── Escritura ───────────────────────────────────────────────
  if (!APPLY) {
    console.log("\nSimulación: nada se escribió. Agrega --aplicar para escribir.");
    return;
  }

  for (const update of listUpdates) {
    await prisma.client.update({ where: { id: update.clientId }, data: { priceListId: update.listId } });
  }
  for (const update of negotiationUpdates) {
    await prisma.client.update({
      where: { id: update.clientId },
      data: { negotiationFirstPct: update.first, negotiationNextPct: update.next },
    });
  }
  for (const list of superLists) {
    const existing = listByName.get(normalize(list.name));
    const listId =
      existing ??
      (await prisma.priceList.create({ data: { name: list.name, isDefault: false, active: true } })).id;
    for (const item of list.items) {
      await prisma.priceListItem.upsert({
        where: { priceListId_variantId_minQty: { priceListId: listId, variantId: item.variantId, minQty: 1 } },
        update: {},
        create: { priceListId: listId, variantId: item.variantId, price: item.price, minQty: 1 },
      });
    }
    if (list.clientId) {
      await prisma.client.update({ where: { id: list.clientId }, data: { priceListId: listId } });
    }
  }
  console.log("\nEscrito.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
