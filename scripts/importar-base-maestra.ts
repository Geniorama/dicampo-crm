import "dotenv/config";
import { randomInt } from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/guards";
import { addContact } from "../src/server/services/clients";
import { refreshClientSalesStats } from "../src/server/services/client-sales";
import { createUser } from "../src/server/services/users";
import { userCreateSchema } from "../src/server/validators/users";
import { comparisonKey } from "../src/server/import/helpers";
import { calculateNitDv } from "../src/lib/nit";
import {
  advisorEmail,
  calendarToNoonBogota,
  cleanDay,
  daysForZone,
  firstNameKey,
  isUnassigned,
  parseMasterNit,
  parseRelationStatus,
} from "../src/lib/master-base";

/**
 * Carga la base final de Dicampo ("Libro maestro": un cliente por fila) en el
 * CRM: asesor responsable, zona, localidad, estado comercial, días de pedido
 * y de entrega, y el corte de ventas (pedidos, venta total, último pedido).
 *
 * - Cruza cada fila con un cliente existente por NIT y, si no, por razón
 *   social; lo que no existe se crea. Crea los asesores que falten
 *   (VENDEDOR, nombre@dicampo.co) e imprime su contraseña inicial una vez.
 * - Es idempotente: repetirlo no duplica nada.
 * - Por defecto solo simula. Escribe únicamente con `--aplicar`.
 *
 *   npx tsx scripts/importar-base-maestra.ts "Base final - dicampo.xlsx"
 *   npx tsx scripts/importar-base-maestra.ts "Base final - dicampo.xlsx" --aplicar
 *
 * DATABASE_URL debe ser la base que se quiere cargar.
 */

const args = process.argv.slice(2);
const FILE = args.find((arg) => !arg.startsWith("--"));
const APPLY = args.includes("--aplicar");

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makePassword = () =>
  Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

function cell(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text ?? "").trim();
    return "";
  }
  return String(value ?? "").trim();
}

const number = (raw: string) => {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

type MasterRow = {
  line: number;
  name: string;
  tier: string;
  contact: string;
  phone: string;
  email: string;
  locality: string;
  neighborhood: string;
  address: string;
  zone: string;
  advisor: string;
  nit: string | null;
  billing: string;
  branch: string;
  orderCount: number;
  salesTotal: number;
  lastOrderAt: Date | null;
  relation: ReturnType<typeof parseRelationStatus>;
  orderDay: string | null;
  deliveryDay: string | null;
};

async function readRows(file: string): Promise<MasterRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.getWorksheet("Libro maestro") ?? workbook.worksheets[0];

  const header = new Map<string, number>();
  sheet.getRow(1).eachCell((c, column) => header.set(comparisonKey(cell(c.value)), column));
  const col = (key: string) => {
    const index = header.get(key);
    if (!index) throw new Error(`Falta la columna "${key}" en la hoja ${sheet.name}.`);
    return index;
  };
  const C = {
    name: col("cliente"), tier: col("tipocliente"), contact: col("contacto"),
    phone: col("telefono"), email: col("email"), locality: col("localidad"),
    neighborhood: col("barrio"), address: col("direccion"), zone: col("zonaruta"),
    advisor: col("asesor"), nit: col("nit"), billing: col("formafacturacion"),
    branch: col("sede"), orders: col("npedidos"), sales: col("ventareallinea"),
    last: col("ultimopedido"), state: col("estadodelcliente"),
    deliveryDay: col("diadeentrega"), orderDay: col("diadecontacto"),
  };

  const rows: MasterRow[] = [];
  for (let line = 2; line <= sheet.rowCount; line += 1) {
    const row = sheet.getRow(line);
    const get = (column: number) => cell(row.getCell(column).value);
    const name = get(C.name);
    if (!name) continue;

    const lastValue = row.getCell(C.last).value;
    const zone = get(C.zone);
    const zoneDays = daysForZone(zone);

    rows.push({
      line, name,
      tier: get(C.tier), contact: get(C.contact), phone: get(C.phone), email: get(C.email),
      locality: get(C.locality), neighborhood: get(C.neighborhood), address: get(C.address),
      zone: zone === "null" ? "" : zone,
      advisor: get(C.advisor),
      nit: parseMasterNit(get(C.nit)),
      billing: get(C.billing), branch: get(C.branch),
      orderCount: Math.round(number(get(C.orders))),
      salesTotal: number(get(C.sales)),
      lastOrderAt: lastValue instanceof Date ? calendarToNoonBogota(lastValue) : null,
      relation: parseRelationStatus(get(C.state)),
      orderDay: cleanDay(get(C.orderDay)) ?? zoneDays?.order ?? null,
      deliveryDay: cleanDay(get(C.deliveryDay)) ?? zoneDays?.delivery ?? null,
    });
  }
  return rows;
}

function cleanPhone(raw: string): string | undefined {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("3") && digits.endsWith("0")) digits = digits.slice(0, 10);
  return /^3\d{9}$/.test(digits) || /^60\d{8}$/.test(digits) || /^\d{7}$/.test(digits) ? digits : undefined;
}

async function main() {
  if (!FILE) {
    console.error('Uso: npx tsx scripts/importar-base-maestra.ts "<archivo.xlsx>" [--aplicar]');
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Base: ${url.host}${url.pathname}  (${APPLY ? "ESCRIBE" : "simulación"})\n`);

  const all = await readRows(FILE);

  // Una fila repetida (mismo NIT o mismo nombre) es el mismo cliente: gana la primera.
  const seen = new Set<string>();
  const rows = all.filter((row) => {
    const keys = [row.nit && `nit:${row.nit}`, `nombre:${comparisonKey(row.name)}`].filter(Boolean) as string[];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
  console.log(`${all.length} filas leídas, ${rows.length} clientes únicos.`);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin) throw new Error("No hay un usuario ADMIN activo en esta base.");
  const actor: SessionUser = admin;

  // ── Asesores ────────────────────────────────────────────────
  const advisorNames = [...new Set(rows.map((r) => r.advisor).filter((a) => !isUnassigned(a)))];
  const users = await prisma.user.findMany({
    where: { role: { in: ["VENDEDOR", "ADMIN"] } },
    select: { id: true, name: true, email: true, active: true },
  });
  const advisorId = new Map<string, string>();
  for (const name of advisorNames) {
    const found = users.find((u) => firstNameKey(u.name) === firstNameKey(name));
    if (found) {
      advisorId.set(name, found.id);
      console.log(`  asesor  ${name} → ${found.name} (${found.email})${found.active ? "" : " [INACTIVO]"}`);
      continue;
    }
    const email = advisorEmail(name);
    if (!APPLY) {
      console.log(`  asesor  ${name} → crearía ${email}`);
      continue;
    }
    const password = makePassword();
    const created = await createUser(
      userCreateSchema.parse({ name, email, password, role: "VENDEDOR" }),
    );
    advisorId.set(name, created.id);
    console.log(`  asesor  ${name} → CREADO ${email} · contraseña inicial: ${password}`);
  }

  // ── Zonas ───────────────────────────────────────────────────
  const zoneNames = [...new Set(rows.map((r) => r.zone).filter(Boolean))];
  const zoneId = new Map<string, string>();
  for (const name of zoneNames) {
    const existing = await prisma.deliveryZone.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      zoneId.set(name, existing.id);
    } else if (APPLY) {
      zoneId.set(name, (await prisma.deliveryZone.create({ data: { name } })).id);
      console.log(`  zona    creada "${name}"`);
    } else {
      console.log(`  zona    crearía "${name}"`);
    }
  }

  // ── Clientes ────────────────────────────────────────────────
  const existingClients = await prisma.client.findMany({
    select: { id: true, nit: true, businessName: true },
  });
  const byNit = new Map(existingClients.filter((c) => c.nit).map((c) => [c.nit as string, c.id]));
  const byName = new Map(existingClients.map((c) => [comparisonKey(c.businessName), c.id]));
  const priceLists = await prisma.priceList.findMany({ select: { id: true, name: true, isDefault: true } });
  const defaultList = priceLists.find((l) => l.isDefault) ?? priceLists[0];

  const counts = { creados: 0, actualizados: 0, sedes: 0, contactos: 0, sinAsesor: 0 };
  const touched: string[] = [];

  for (const row of rows) {
    const matchId = (row.nit && byNit.get(row.nit)) || byName.get(comparisonKey(row.name));
    const ownerId = isUnassigned(row.advisor) ? null : (advisorId.get(row.advisor) ?? null);
    if (ownerId === null) counts.sinAsesor += 1;

    const isSuper = comparisonKey(row.tier) === "superdistribuidor";
    const list = priceLists.find((l) => comparisonKey(l.name) === comparisonKey(row.tier));
    const billingMode = comparisonKey(row.billing) === "factura" ? "FACTURA" : "REMISION";

    const salesData = {
      relationStatus: row.relation,
      orderDay: row.orderDay,
      deliveryDay: row.deliveryDay,
      baseOrderCount: row.orderCount,
      baseSalesTotal: row.salesTotal,
      baseLastOrderAt: row.lastOrderAt,
      lastOrderAt: row.lastOrderAt,
      orderCount: row.orderCount,
      avgTicket: row.orderCount > 0 ? Math.round((row.salesTotal / row.orderCount) * 100) / 100 : 0,
    };

    if (!APPLY) {
      if (matchId) counts.actualizados += 1;
      else counts.creados += 1;
      continue;
    }

    let clientId: string;
    if (matchId) {
      clientId = matchId;
      await prisma.client.update({
        where: { id: clientId },
        data: {
          ...salesData,
          ownerId,
          billingMode,
          ...(isSuper ? { isSuperDistributor: true } : {}),
        },
      });
      counts.actualizados += 1;
    } else {
      const created = await prisma.client.create({
        data: {
          businessName: row.name,
          nit: row.nit ?? undefined,
          nitDv: row.nit ? (calculateNitDv(row.nit) ?? undefined) : undefined,
          // Es un cliente real de la base, tenga o no NIT (las remisiones no lo exigen).
          status: "ACTIVO",
          type: "OTRO",
          email: row.email.includes("@") ? row.email : undefined,
          phone: cleanPhone(row.phone),
          ownerId,
          billingMode,
          isSuperDistributor: isSuper,
          priceListId: (list ?? defaultList)?.id,
          notes: "Cargado de la base final de Dicampo.",
          ...salesData,
        },
      });
      clientId = created.id;
      if (row.nit) byNit.set(row.nit, clientId);
      byName.set(comparisonKey(row.name), clientId);
      counts.creados += 1;
    }
    touched.push(clientId);

    // Sede principal: localidad, barrio, dirección y zona de la fila.
    const zone = row.zone ? zoneId.get(row.zone) : undefined;
    const primary = await prisma.clientAddress.findFirst({
      where: { clientId, active: true },
      orderBy: { isPrimary: "desc" },
    });
    const addressText = row.address.length >= 5 ? row.address : undefined;
    if (primary) {
      await prisma.clientAddress.update({
        where: { id: primary.id },
        data: {
          ...(row.locality && row.locality !== "null" ? { locality: row.locality } : {}),
          ...(row.neighborhood && row.neighborhood !== "null" ? { neighborhood: row.neighborhood } : {}),
          ...(zone ? { zoneId: zone } : {}),
        },
      });
    } else if (addressText) {
      await prisma.clientAddress.create({
        data: {
          clientId,
          label: row.branch && row.branch !== "null" ? row.branch.slice(0, 100) : "Sede principal",
          address: addressText.slice(0, 200),
          neighborhood: row.neighborhood && row.neighborhood !== "null" ? row.neighborhood : undefined,
          locality: row.locality && row.locality !== "null" ? row.locality : undefined,
          zoneId: zone,
          isPrimary: true,
        },
      });
      counts.sedes += 1;
    }

    // Contacto: solo si el cliente no tiene ninguno activo.
    const phone = cleanPhone(row.phone);
    if ((row.contact && row.contact !== "null") || phone) {
      const hasContact = await prisma.contact.count({ where: { clientId, active: true } });
      if (hasContact === 0) {
        const input = {
          firstName: (row.contact && row.contact !== "null" ? row.contact : row.name).slice(0, 100).padEnd(2, " "),
          phone,
          whatsapp: phone && /^3\d{9}$/.test(phone) ? phone : undefined,
          isPrimary: true,
        };
        await addContact(actor, clientId, input);
        counts.contactos += 1;
      }
    }
  }

  // Suma a las cifras de la base los pedidos que el CRM ya tenga después del corte.
  if (APPLY) for (const id of touched) await refreshClientSalesStats(id);

  console.log(
    `\n${APPLY ? "Escrito" : "Simulación"}: crear=${counts.creados} actualizar=${counts.actualizados}` +
      ` sedes nuevas=${counts.sedes} contactos nuevos=${counts.contactos} sin asesor=${counts.sinAsesor}`,
  );
  if (!APPLY) console.log("Agrega --aplicar para escribir.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
