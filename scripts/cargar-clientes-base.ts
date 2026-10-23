import "dotenv/config";
import ExcelJS from "exceljs";
import { prisma } from "../src/server/db";
import type { SessionUser } from "../src/server/guards";
import { analyzeImport, runImport } from "../src/server/services/imports";
import { comparisonKey } from "../src/server/import/helpers";
import { onlyDigits } from "../src/lib/nit";

/**
 * Carga la base de clientes de los asesores (Base_Clientes_Andres_Fabian.xlsx:
 * una hoja por asesor y una de distribuidores) con el motor de la carga masiva,
 * después de limpiar lo que el motor rechazaría: NIT con dígito de
 * verificación, teléfonos con un cero de más, correos mal escritos y filas
 * repetidas.
 *
 * Solo lee lo que identifica al cliente. Los hábitos de compra (frecuencia,
 * día, sabores, pedido habitual) y el último pedido se calculan desde los
 * pedidos: no se importan.
 *
 * Por defecto simula. Escribe únicamente con `--aplicar`. Es idempotente: un
 * cliente que ya existe (por NIT o razón social) se actualiza, no se duplica.
 *
 *   npx tsx scripts/cargar-clientes-base.ts ruta/Base_Clientes.xlsx
 *   npx tsx scripts/cargar-clientes-base.ts ruta/Base_Clientes.xlsx --aplicar
 */

const args = process.argv.slice(2);
const FILE = args.find((arg) => !arg.startsWith("--"));
const APPLY = args.includes("--aplicar");

/** Niveles del archivo que existen como lista de precios del CRM. */
const PRICE_LISTS = new Set(["distribuidor", "mayorista", "publico general"]);

type Draft = {
  name: string;
  tier: string;
  nit: string;
  contact: string;
  phone: string;
  email: string;
  locality: string;
  neighborhood: string;
  address: string;
  branches: string;
  sheets: string[];
};

const extraPhones = new Map<string, string>();

const cleaning = {
  nitDropped: [] as string[],
  phoneFixed: [] as string[],
  phoneDropped: [] as string[],
  emailFixed: [] as string[],
  emailDropped: [] as string[],
  duplicates: 0,
  tierWithoutList: new Map<string, number>(),
};

/** ExcelJS devuelve fórmulas y textos enriquecidos como objetos. */
function cellText(value: ExcelJS.CellValue): string {
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
    if ("text" in value) return String(value.text ?? "").trim();
  }
  return String(value ?? "").trim();
}

/** "901185466-0" → "901185466" (el DV lo calcula el CRM). */
function cleanNit(raw: string, name: string): string {
  const withDv = /^([\d.\s]+?)\s*-\s*\d$/.exec(raw);
  const digits = onlyDigits(withDv ? withDv[1] : raw);
  if (!raw) return "";
  if (digits.length < 5 || digits.length > 15) {
    cleaning.nitDropped.push(`${name}: "${raw}"`);
    return "";
  }
  return digits;
}

/**
 * Celular colombiano de 10 dígitos que empieza por 3. Varios del archivo
 * traen un cero de más al final ("31960182480"), señal de una celda de número
 * mal convertida; se corrige solo ese caso.
 */
function cleanPhone(raw: string, name: string): string {
  // Dos números en la misma celda: se toma el primero (el segundo va a las notas).
  const groups = raw.split(/[\s,;/-]+/).map(onlyDigits).filter((group) => group.length >= 7);
  if (groups.length > 1 && groups.every((group) => /^3\d{9}$/.test(group))) {
    cleaning.phoneFixed.push(`${name}: "${raw}" → ${groups[0]} (segundo número a notas)`);
    extraPhones.set(comparisonKey(name), groups.slice(1).join(", "));
    return groups[0];
  }
  let digits = onlyDigits(raw);
  if (!digits) return "";
  if (digits.startsWith("57") && digits.length === 12) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("3") && digits.endsWith("0")) {
    cleaning.phoneFixed.push(`${name}: ${raw} → ${digits.slice(0, 10)}`);
    return digits.slice(0, 10);
  }
  if (/^3\d{9}$/.test(digits) || /^60\d{8}$/.test(digits) || /^\d{7}$/.test(digits)) return digits;
  cleaning.phoneDropped.push(`${name}: "${raw}"`);
  return "";
}

function cleanEmail(raw: string, name: string): string {
  let email = raw.trim().replace(/\s+/g, "");
  if (!email) return "";
  if (/\.comp$/i.test(email)) {
    cleaning.emailFixed.push(`${name}: ${raw} → ${email.slice(0, -1)}`);
    email = email.slice(0, -1);
  }
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(email)) return email;
  cleaning.emailDropped.push(`${name}: "${raw}"`);
  return "";
}

/** Lee las hojas por nombre de encabezado: no todas traen las mismas columnas. */
async function readDrafts(file: string): Promise<Draft[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const byName = new Map<string, Draft>();

  for (const sheet of workbook.worksheets) {
    const header = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      header.set(comparisonKey(cellText(cell.value)), column);
    });
    // La primera columna es siempre el cliente, aunque su encabezado sea otro.
    const get = (row: ExcelJS.Row, key: string) => {
      const column = header.get(key);
      return column ? cellText(row.getCell(column).value) : "";
    };

    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const name = cellText(row.getCell(1).value);
      if (!name) return;

      const draft: Draft = {
        name,
        tier: get(row, "tipo cliente"),
        nit: cleanNit(get(row, "nit"), name),
        contact: get(row, "contacto"),
        phone: cleanPhone(get(row, "telefono"), name),
        email: cleanEmail(get(row, "email"), name),
        locality: get(row, "localidad"),
        neighborhood: get(row, "barrio"),
        address: get(row, "direccion"),
        branches: get(row, "sedes"),
        sheets: [sheet.name],
      };

      const key = comparisonKey(name);
      const previous = byName.get(key);
      if (!previous) {
        byName.set(key, draft);
        return;
      }

      // Mismo cliente en otra fila u otra hoja: se completa lo que faltaba.
      cleaning.duplicates += 1;
      for (const field of [
        "tier", "nit", "contact", "phone", "email", "locality", "neighborhood", "address", "branches",
      ] as const) {
        if (!previous[field] && draft[field]) previous[field] = draft[field];
      }
      previous.sheets.push(sheet.name);
    });
  }

  return [...byName.values()];
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const COLUMNS = [
  "Razón social", "NIT", "Lista de precios", "Estado", "Correo", "Teléfono", "Notas",
  "Sede: dirección", "Sede: barrio", "Sede: localidad",
  "Contacto: nombre", "Contacto: teléfono", "Contacto: WhatsApp", "Contacto: correo",
] as const;

function toCsv(drafts: Draft[]): string {
  const lines = drafts.map((draft) => {
    const tier = comparisonKey(draft.tier);
    const priceList = PRICE_LISTS.has(tier) ? draft.tier : "";
    if (draft.tier && !priceList) {
      cleaning.tierWithoutList.set(draft.tier, (cleaning.tierWithoutList.get(draft.tier) ?? 0) + 1);
    }

    const mobile = /^3\d{9}$/.test(draft.phone) ? draft.phone : "";
    // Una "dirección" de menos de 5 caracteres ("104") no es una dirección: va a notas.
    const validAddress = draft.address.length >= 5;
    const notes = [
      draft.branches && `Sedes: ${draft.branches}`,
      !validAddress && draft.address && `Dirección en el archivo: ${draft.address}`,
      extraPhones.get(comparisonKey(draft.name)) &&
        `Otro teléfono: ${extraPhones.get(comparisonKey(draft.name))}`,
      "Cargado de la base comercial de asesores.",
    ].filter(Boolean).join(" · ");

    // Un cliente activo necesita NIT; sin él queda como prospecto hasta tenerlo.
    const status = draft.nit ? "Activo" : "Prospecto";

    return [
      draft.name, draft.nit, priceList, status, draft.email, draft.phone, notes,
      validAddress ? draft.address : "",
      validAddress ? draft.neighborhood : "",
      validAddress ? draft.locality : "",
      // Sin nombre de contacto, el cliente da el nombre: el contacto es lo
      // que lleva el WhatsApp con el que el agente encuentra al cliente.
      draft.phone || draft.email ? draft.contact || draft.name : draft.contact,
      draft.phone, mobile, draft.email,
    ].map(csvCell).join(";");
  });

  return "﻿" + [COLUMNS.map(csvCell).join(";"), ...lines].join("\n");
}

async function main() {
  if (!FILE) {
    console.error("Uso: npx tsx scripts/cargar-clientes-base.ts <archivo.xlsx> [--aplicar]");
    process.exit(1);
  }

  console.log(`Base: ${new URL(process.env.DATABASE_URL ?? "").host}${new URL(process.env.DATABASE_URL ?? "").pathname}`);

  const drafts = await readDrafts(FILE);
  console.log(`${drafts.length} clientes únicos (${cleaning.duplicates} filas repetidas fusionadas).`);

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin) throw new Error("No hay un usuario ADMIN activo en esta base.");
  const user: SessionUser = admin;

  const file = new File([toCsv(drafts)], "clientes-base.csv", { type: "text/csv" });
  const analysis = await analyzeImport("clientes", file);
  if (analysis.missing.length > 0) {
    throw new Error(`El cotejo no cubrió: ${analysis.missing.join(", ")}`);
  }

  const report = await runImport(user, "clientes", {
    mode: "mezclar",
    dryRun: !APPLY,
    mapping: analysis.suggestion,
    rows: analysis.rows,
  });

  console.log(APPLY ? "\nEscrito:" : "\nSimulación (nada se escribió):");
  console.log(
    `  crear=${report.counts.crear} actualizar=${report.counts.actualizar} omitir=${report.counts.omitir} error=${report.counts.error}`,
  );

  const errors = report.rows.filter((row) => row.action === "error");
  if (errors.length > 0) {
    console.log("\nFilas con error:");
    errors.slice(0, 30).forEach((row) => console.log(`  fila ${row.line} ${row.label}: ${row.message}`));
  }
  const warned = report.rows.filter((row) => row.message?.includes("no existe"));
  if (warned.length > 0) console.log(`\nAvisos de zona: ${warned.length}`);

  const show = (title: string, items: string[]) => {
    if (items.length === 0) return;
    console.log(`\n${title} (${items.length}):`);
    items.slice(0, 25).forEach((item) => console.log(`  ${item}`));
  };
  show("NIT descartados por longitud", cleaning.nitDropped);
  show("Teléfonos corregidos (cero de más)", cleaning.phoneFixed);
  show("Teléfonos descartados", cleaning.phoneDropped);
  show("Correos corregidos", cleaning.emailFixed);
  show("Correos descartados", cleaning.emailDropped);
  if (cleaning.tierWithoutList.size > 0) {
    console.log("\nNiveles sin lista de precios en el CRM (el cliente queda con la lista por defecto):");
    for (const [tier, count] of cleaning.tierWithoutList) console.log(`  ${count}  ${tier}`);
  }

  if (!APPLY) console.log("\nAgrega --aplicar para escribir.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
