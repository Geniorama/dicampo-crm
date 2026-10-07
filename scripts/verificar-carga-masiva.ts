import "dotenv/config";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/guards";
import type { ImportEntityKey } from "../src/lib/import/entities";
import type { ImportMode, ImportReport } from "../src/lib/import/types";
import {
  analyzeImport,
  canImport,
  runImport,
} from "../src/server/services/imports";
import { importAccess } from "../src/server/import/registry";

/**
 * Comprueba la carga masiva de punta a punta contra la base configurada en
 * `DATABASE_URL`: lee un CSV, toma el cotejo que propone el propio módulo,
 * simula, ejecuta y mira en la base lo que quedó.
 *
 * Todo lo que crea lleva la marca `ZZVERIF` y se borra al terminar (y al
 * empezar, por si una corrida anterior se cortó). No toca ningún precio ni
 * cliente existente: el escalón de precio de prueba usa una cantidad mínima
 * que nadie más usa.
 *
 *   npx tsx scripts/verificar-carga-masiva.ts
 */

const TAG = "ZZVERIF";
const TIER = 777;

let fails = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${ok ? "" : ` -- ${detail}`}`);
  if (!ok) fails += 1;
};

const countsOf = (report: ImportReport) =>
  `crear=${report.counts.crear} actualizar=${report.counts.actualizar} omitir=${report.counts.omitir} error=${report.counts.error}`;

const errorsOf = (report: ImportReport) =>
  report.rows
    .filter((row) => row.action === "error")
    .map((row) => `fila ${row.line}: ${row.message}`)
    .join(" | ");

/** Analiza el CSV y lo corre con el cotejo sugerido, sin retocarlo. */
async function load(
  user: SessionUser,
  key: ImportEntityKey,
  csv: string,
  options: { dryRun: boolean; mode?: ImportMode },
): Promise<ImportReport> {
  const file = new File(["﻿" + csv], `${key}.csv`, { type: "text/csv" });
  const analysis = await analyzeImport(key, file);

  if (analysis.missing.length > 0) {
    throw new Error(`${key}: el cotejo no cubrió ${analysis.missing.join(", ")}`);
  }

  return runImport(user, key, {
    // Los lotes solo admiten crear.
    mode: options.mode ?? (key === "lotes" ? "crear" : "mezclar"),
    dryRun: options.dryRun,
    mapping: analysis.suggestion,
    rows: analysis.rows,
  });
}

/** Simula y ejecuta; exige que la simulación prometa lo que luego ocurre. */
async function dryThenReal(
  user: SessionUser,
  key: ImportEntityKey,
  csv: string,
  expected: string,
): Promise<ImportReport> {
  const dry = await load(user, key, csv, { dryRun: true });
  const real = await load(user, key, csv, { dryRun: false });

  check(`${key}: resultado esperado (${countsOf(real)})`, countsOf(real) === expected, `se esperaba ${expected} · ${errorsOf(real)}`);
  check(
    `${key}: la simulación anunció lo mismo que se ejecutó`,
    countsOf(dry) === countsOf(real),
    `simulación ${countsOf(dry)}`,
  );

  return real;
}

async function clean() {
  const clients = await prisma.client.findMany({
    where: { businessName: { startsWith: TAG } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);

  await prisma.activity.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.opportunity.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } });

  await prisma.stockMovement.deleteMany({
    where: { lot: { lotCode: { startsWith: TAG } } },
  });
  await prisma.lot.deleteMany({ where: { lotCode: { startsWith: TAG } } });
  await prisma.priceListItem.deleteMany({ where: { minQty: TIER } });
  await prisma.product.deleteMany({ where: { flavor: { startsWith: TAG } } });
}

async function sessionUser(role: SessionUser["role"]): Promise<SessionUser> {
  const user = await prisma.user.findFirst({
    where: { role, active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new Error(`No hay un usuario ${role} activo en esta base.`);
  return user;
}

async function totals() {
  const [clients, contacts, addresses, products, variants, prices, lots, moves, opps] =
    await Promise.all([
      prisma.client.count(),
      prisma.contact.count(),
      prisma.clientAddress.count(),
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.priceListItem.count(),
      prisma.lot.count(),
      prisma.stockMovement.count(),
      prisma.opportunity.count(),
    ]);
  return JSON.stringify({ clients, contacts, addresses, products, variants, prices, lots, moves, opps });
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "").host;
  console.log(`Base: ${host}\n`);

  await clean();
  const before = await totals();

  const admin = await sessionUser("ADMIN");
  const seller = await sessionUser("VENDEDOR");
  const warehouse = await sessionUser("BODEGA");

  // ── Permisos ───────────────────────────────────────────────
  console.log("Permisos por módulo");
  check("un vendedor no puede subir precios", !canImport(seller, importAccess("precios")));
  check("un vendedor no puede subir productos", !canImport(seller, importAccess("productos")));
  check("un vendedor no puede subir lotes", !canImport(seller, importAccess("lotes")));
  check("bodega sí puede subir lotes", canImport(warehouse, importAccess("lotes")));
  check("bodega no puede subir clientes", !canImport(warehouse, importAccess("clientes")));
  check("un vendedor sí puede subir clientes", canImport(seller, importAccess("clientes")));

  // ── Clientes ───────────────────────────────────────────────
  console.log("\nClientes (con sede y contacto en la misma fila)");
  const clientsCsv = [
    "Razón social;NIT;Tipo;Estado;Teléfono;Dirección;Barrio;Zona;Contacto;Apellido;Cargo;WhatsApp",
    `${TAG} Panadería El Trigo;900.999.001;Panadería;Prospecto;3001112233;Calle 53 # 13-40;Chapinero;Chapinero;María;Ñáñez;Administradora;3001112233`,
    `${TAG} Frutería La Ñapa;900.999.002;Frutería;Prospecto;3004445566;Carrera 7 # 120-15;Usaquén;Zona Inexistente;José;Peña;Dueño;3004445566`,
    `${TAG} Restaurante Sin Sede;900.999.003;Restaurante;Prospecto;;;;;;;;`,
    `${TAG} Tipo Malo;900.999.004;Ferretería;Prospecto;;;;;;;;`,
  ].join("\r\n");

  const untouched = await totals();
  const dryOnly = await load(admin, "clientes", clientsCsv, { dryRun: true });
  check("la simulación no escribe nada", (await totals()) === untouched, countsOf(dryOnly));

  const clientsReport = await dryThenReal(admin, "clientes", clientsCsv, "crear=3 actualizar=0 omitir=0 error=1");
  const badType = clientsReport.rows.find((row) => row.action === "error");
  check("la fila mala explica qué valores admite", /Opciones:/.test(badType?.message ?? ""), badType?.message);
  check(
    "la zona que no existe se avisa en el informe",
    clientsReport.rows.some((row) => /no existe: la sede queda sin zona/.test(row.message ?? "")),
  );

  const trigo = await prisma.client.findFirst({
    where: { businessName: `${TAG} Panadería El Trigo` },
    include: { addresses: { include: { zone: true } }, contacts: true },
  });
  check("NIT guardado sin puntos", trigo?.nit === "900999001", String(trigo?.nit));
  check("dígito de verificación calculado", Boolean(trigo?.nitDv), String(trigo?.nitDv));
  check("tipo y estado traducidos al enum", trigo?.type === "PANADERIA" && trigo?.status === "PROSPECTO", `${trigo?.type}/${trigo?.status}`);
  check("sede creada como principal y con zona", trigo?.addresses.length === 1 && trigo.addresses[0].isPrimary && trigo.addresses[0].zone?.name === "Chapinero");
  check("contacto creado como principal, con eñe y tildes", trigo?.contacts.length === 1 && trigo.contacts[0].isPrimary && trigo.contacts[0].lastName === "Ñáñez", trigo?.contacts[0]?.lastName ?? "");

  const napa = await prisma.client.findFirst({
    where: { businessName: `${TAG} Frutería La Ñapa` },
    include: { addresses: true },
  });
  check("sede con zona desconocida entra sin zona", napa?.addresses.length === 1 && napa.addresses[0].zoneId === null);
  check("la fila mala no se creó", (await prisma.client.count({ where: { businessName: `${TAG} Tipo Malo` } })) === 0);

  const again = await load(admin, "clientes", clientsCsv, { dryRun: false });
  check(`reimportar actualiza en vez de duplicar (${countsOf(again)})`, countsOf(again) === "crear=0 actualizar=3 omitir=0 error=1");
  const trigoAgain = await prisma.client.findFirst({
    where: { businessName: `${TAG} Panadería El Trigo` },
    include: { addresses: true, contacts: true },
  });
  check("reimportar no repite la sede ni el contacto", trigoAgain?.addresses.length === 1 && trigoAgain.contacts.length === 1);

  const onlyCreate = await load(admin, "clientes", clientsCsv, { dryRun: false, mode: "crear" });
  check(`modo "solo crear" omite los existentes (${countsOf(onlyCreate)})`, countsOf(onlyCreate) === "crear=0 actualizar=0 omitir=3 error=1");

  // ── Contactos ──────────────────────────────────────────────
  console.log("\nContactos");
  const contactsCsv = [
    "NIT del cliente;Nombre;Apellido;Cargo;Celular;Principal",
    "900.999.001;Camila;Rojas;Chef;3110000001;No",
    "900.999.003;Andrés;Gómez;Compras;3110000002;",
    "999.000.000;Nadie;Perdido;;;",
  ].join("\n");
  await dryThenReal(admin, "contactos", contactsCsv, "crear=2 actualizar=0 omitir=0 error=1");

  const trigoContacts = await prisma.contact.findMany({ where: { clientId: trigo?.id } });
  check("el cliente queda con dos contactos y un solo principal", trigoContacts.length === 2 && trigoContacts.filter((row) => row.isPrimary).length === 1);
  const sinSede = await prisma.client.findFirst({
    where: { businessName: `${TAG} Restaurante Sin Sede` },
    include: { contacts: true },
  });
  check("el primer contacto de un cliente nace principal", sinSede?.contacts.length === 1 && sinSede.contacts[0].isPrimary);

  // ── Sedes ──────────────────────────────────────────────────
  console.log("\nSedes");
  const addressesCsv = [
    "Cliente,Sede,Dirección,Barrio,Ciudad,Zona,Principal",
    `${TAG} Panadería El Trigo,Punto Norte,"Calle 140 # 11-20, local 3",Cedritos,Bogotá,Norte,Sí`,
    `${TAG} Restaurante Sin Sede,Sede única,Carrera 15 # 85-10,Chicó,Bogotá,Chapinero,`,
  ].join("\n");
  await dryThenReal(admin, "sedes", addressesCsv, "crear=2 actualizar=0 omitir=0 error=0");

  const trigoAddresses = await prisma.clientAddress.findMany({ where: { clientId: trigo?.id } });
  const primary = trigoAddresses.filter((row) => row.isPrimary);
  check("la nueva sede principal desplaza a la anterior", trigoAddresses.length === 2 && primary.length === 1 && primary[0].label === "Punto Norte", primary.map((row) => row.label).join(","));
  check("la coma dentro de comillas no partió la dirección", primary[0]?.address === "Calle 140 # 11-20, local 3", primary[0]?.address);

  // ── Productos ──────────────────────────────────────────────
  console.log("\nProductos y presentaciones");
  const productsCsv = [
    "Producto;Sabor;Categoría;IVA;Presentación;Precio",
    `Pulpa de ${TAG};${TAG} Borojó;Pulpa;19;Kilo;18.500`,
    `Pulpa de ${TAG};${TAG} Borojó;Pulpa;19;Libra;9.800`,
    `Pulpa rara;${TAG} Raro;Pulpa;7;Kilo;10.000`,
  ].join("\n");
  // La segunda fila es el mismo sabor: en simulación todavía no existe.
  const productsDry = await load(admin, "productos", productsCsv, { dryRun: true });
  const productsReal = await load(admin, "productos", productsCsv, { dryRun: false });
  check(`productos: resultado esperado (${countsOf(productsReal)})`, countsOf(productsReal) === "crear=1 actualizar=1 omitir=0 error=1", errorsOf(productsReal));
  check(
    `productos: la simulación anunció lo mismo que se ejecutó`,
    countsOf(productsDry) === countsOf(productsReal),
    `simulación ${countsOf(productsDry)}`,
  );

  const product = await prisma.product.findFirst({
    where: { flavor: `${TAG} Borojó` },
    include: { variants: { include: { priceItems: true } } },
  });
  check("IVA escrito como 19 se guarda como 0,19", Number(product?.taxRate) === 0.19, String(product?.taxRate));
  check("un sabor, dos presentaciones", product?.variants.length === 2);
  const kilo = product?.variants.find((variant) => variant.presentation === "KILO");
  const libra = product?.variants.find((variant) => variant.presentation === "LIBRA");
  check("precio con punto de miles leído bien (kilo 18.500)", Number(kilo?.priceItems[0]?.price) === 18500, String(kilo?.priceItems[0]?.price));
  check("la segunda presentación también quedó con precio (libra 9.800)", Number(libra?.priceItems[0]?.price) === 9800, String(libra?.priceItems[0]?.price));
  check("un IVA que no es 0/5/19 se rechaza", /no es una tarifa admitida/.test(errorsOf(productsReal)), errorsOf(productsReal));

  // ── Precios ────────────────────────────────────────────────
  console.log("\nLista de precios");
  const pricesCsv = [
    "SKU;Nuevo precio;Desde",
    `${kilo?.sku};19.250,50;`,
    `${kilo?.sku};17.000;${TIER}`,
    "NOEXISTE-K;1000;",
    `${libra?.sku};-5;`,
  ].join("\n");
  const pricesReport = await dryThenReal(admin, "precios", pricesCsv, "crear=1 actualizar=1 omitir=0 error=2");
  const kiloPrices = await prisma.priceListItem.findMany({ where: { variantId: kilo?.id }, orderBy: { minQty: "asc" } });
  check("el precio base se actualizó, con coma decimal", Number(kiloPrices[0]?.price) === 19250.5, String(kiloPrices[0]?.price));
  check("el escalón por volumen se creó aparte", kiloPrices.length === 2 && Number(kiloPrices[1].minQty) === TIER && Number(kiloPrices[1].price) === 17000);
  check("el informe muestra el antes y el después", pricesReport.rows.some((row) => /→/.test(row.message ?? "")));

  // ── Lotes ──────────────────────────────────────────────────
  console.log("\nLotes de inventario");
  const lotsCsv = [
    "SKU;Lote;Fecha de producción;Fecha de vencimiento;Cantidad",
    `${kilo?.sku};${TAG}-L1;01/09/2026;01/03/2027;120`,
    `${kilo?.sku};${TAG}-L2;2026-09-15;2027-03-15;80,5`,
    `${kilo?.sku};${TAG}-L1;01/09/2026;01/03/2027;999`,
    `${kilo?.sku};${TAG}-L3;10/09/2026;01/09/2026;10`,
  ].join("\n");
  await dryThenReal(warehouse, "lotes", lotsCsv, "crear=2 actualizar=0 omitir=1 error=1");

  const lots = await prisma.lot.findMany({
    where: { lotCode: { startsWith: TAG } },
    include: { movements: true },
    orderBy: { lotCode: "asc" },
  });
  check("se crearon dos lotes; el repetido no pisó el saldo", lots.length === 2 && Number(lots[0].quantityAvailable) === 120, lots.map((lot) => `${lot.lotCode}=${lot.quantityAvailable}`).join(","));
  check("cada lote dejó su entrada en el kardex", lots.every((lot) => lot.movements.length === 1 && Number(lot.movements[0].quantity) === Number(lot.quantityAvailable)));
  const expiry = lots[0]?.expiryDate;
  check("la fecha 01/03/2027 no se corrió de día", expiry?.getFullYear() === 2027 && expiry.getMonth() === 2 && expiry.getDate() === 1, expiry?.toISOString());
  const lotsAgain = await load(warehouse, "lotes", lotsCsv, { dryRun: false });
  check(`reimportar lotes no crea ni reescribe (${countsOf(lotsAgain)})`, lotsAgain.counts.crear === 0 && lotsAgain.counts.omitir === 3);

  // ── Oportunidades ──────────────────────────────────────────
  console.log("\nOportunidades");
  const oppsCsv = [
    "NIT del cliente;Título;Etapa;Valor estimado;Cierre estimado;Vendedor;Motivo de pérdida",
    `900.999.001;Suministro mensual;Ganada;1.200.000;15/10/2026;${seller.email};`,
    "900.999.002;Prueba de limonadas;Perdida;400.000;;;Precio",
    "900.999.003;Sin motivo;Perdida;300.000;;;",
    "900.999.003;Primer contacto;;250.000;;;",
  ].join("\n");
  await dryThenReal(admin, "oportunidades", oppsCsv, "crear=3 actualizar=0 omitir=0 error=1");

  const won = await prisma.opportunity.findFirst({ where: { clientId: trigo?.id } });
  check("la ganada quedó cerrada y con su vendedor", won?.stage === "GANADA" && won.closedAt !== null && won.ownerId === seller.id, `${won?.stage}`);
  const trigoAfter = await prisma.client.findUnique({ where: { id: trigo?.id } });
  check("ganar activó al cliente que era prospecto", trigoAfter?.status === "ACTIVO", String(trigoAfter?.status));
  const lost = await prisma.opportunity.findFirst({ where: { clientId: napa?.id } });
  check("la perdida guardó su motivo", lost?.stage === "PERDIDA" && lost.lostReason === "Precio");
  check("perder sin motivo se rechaza y no crea nada", (await prisma.opportunity.count({ where: { title: "Sin motivo" } })) === 0);
  const plain = await prisma.opportunity.findFirst({ where: { title: "Primer contacto", clientId: sinSede?.id } });
  check("sin etapa nace en Prospecto", plain?.stage === "PROSPECTO", String(plain?.stage));

  // ── Cartera del vendedor ───────────────────────────────────
  console.log("\nCartera del vendedor");
  const sellerCsv = [
    "Razón social;NIT;Tipo",
    `${TAG} Cafetería Del Vendedor;900.999.005;Cafetería`,
  ].join("\n");
  await load(seller, "clientes", sellerCsv, { dryRun: false });
  const own = await prisma.client.findFirst({ where: { businessName: `${TAG} Cafetería Del Vendedor` } });
  check("el cliente que sube un vendedor queda en su cartera", own?.ownerId === seller.id, String(own?.ownerId));

  const foreignCsv = ["NIT del cliente;Título", "900.999.002;Intento ajeno"].join("\n");
  const foreign = await load(seller, "oportunidades", foreignCsv, { dryRun: false });
  check(
    "un vendedor no puede cargar oportunidades a un cliente ajeno",
    foreign.counts.error === 1 && (await prisma.opportunity.count({ where: { title: "Intento ajeno" } })) === 0,
    countsOf(foreign),
  );

  // ── Limpieza ───────────────────────────────────────────────
  await clean();
  console.log("\nLimpieza");
  check("la base quedó como estaba antes de la prueba", (await totals()) === before, `${before} → ${await totals()}`);
}

main()
  .catch(async (error) => {
    console.error("\nError al verificar la carga masiva:", error);
    fails += 1;
    await clean().catch(() => undefined);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(
      fails === 0
        ? "\nTODO CORRECTO: carga masiva verificada.\n"
        : `\n${fails} COMPROBACIONES FALLARON\n`,
    );
    process.exit(fails === 0 ? 0 : 1);
  });
