import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Fusiona las fichas de cliente que en realidad son sedes de un mismo negocio.
 *
 * El importador de cotizaciones creó una ficha por cada nombre que aparecía en
 * el Excel ("SECAM 63", "ROMANOTI SALITRE"…). Aquí cada cadena está definida a
 * mano, ficha por ficha, porque el nombre solo no basta para saber si dos
 * fichas son el mismo negocio. Lo que no está en `CHAINS` no se toca.
 *
 * Por cada ficha duplicada: sus cotizaciones, contactos, oportunidades,
 * actividades, pedidos y conversaciones pasan al cliente principal, cada una a
 * su sede (`ClientAddress`); después se borra la ficha. Así "primer pedido de
 * cada sede" y el historial quedan bien.
 *
 * Por defecto simula. Escribe únicamente con `--aplicar`, y antes guarda en
 * `--respaldo <archivo.json>` lo que va a borrar.
 *
 *   npx tsx scripts/fusionar-sedes.ts
 *   npx tsx scripts/fusionar-sedes.ts --aplicar --respaldo respaldo.json
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const APPLY = args.includes("--aplicar");
const BACKUP = args[args.indexOf("--respaldo") + 1] && args.includes("--respaldo")
  ? args[args.indexOf("--respaldo") + 1]
  : "respaldo-fusion-sedes.json";

type Chain = {
  /** Ficha que queda. */
  target: string;
  /** Nuevo nombre del cliente, si la ficha elegida lleva el de una sola sede. */
  rename?: string;
  /** Ficha duplicada → sede. `null`: es la misma sede del cliente principal. */
  members: Record<string, string | null>;
};

const CHAINS: Chain[] = [
  {
    target: "Pasteleria Romanoti SAS",
    members: {
      "ROMANOTI GALERÍA": "Galerías",
      "romanoti galerias": "Galerías",
      "Romanoti Pablo sexto": "Pablo VI",
      "ROMANOTI PABLO VI": "Pablo VI",
      "Romanoti Palermo": "Palermo",
      "ROMANOTI PARK WAY": "Park Way",
      "romanoti pasadena": "Pasadena",
      "ROMANOTI SALITRE": "Salitre",
      "romanoti santa barbara": "Santa Bárbara",
      "romanoti soledad": "Soledad",
      "Romanoti Teusaquillo": "Teusaquillo",
      "ROMANOTI VENECIA": "Venecia",
    },
  },
  {
    target: "buketaire hayuelos",
    rename: "Buketaire",
    members: {
      "buketaire centro mayor": "Centro Mayor",
      "buketaire ciudad montes": "Ciudad Montes",
      "BUKETAIRE MONTES": "Ciudad Montes",
      "BUKETAIRE PASEO VILLA DEL RIO": "Paseo Villa del Río",
      "buketaire villa del rio": "Paseo Villa del Río",
    },
  },
  {
    target: "Inversiones Secam S.A.S.",
    members: {
      "Inversiones secam": null,
      "Inversiones secam sas": null,
      "INVERSIONES SECAM 63": "63",
      "SECAM 63": "63",
      "SECAM 140": "140",
      "SECAM RESTREPO": "Restrepo",
    },
  },
  {
    target: "Suprema Nacional SAS",
    members: {
      SUPREMA: null,
      "SUPREMA NACIONAL": null,
      "SUPREMA ALAMBRA": "Alambra",
      "SUPREMA LA FELICIDAD": "La Felicidad",
      "suprema nacional felicidad": "La Felicidad",
    },
  },
  {
    target: "Panaderia Harmoni",
    members: {
      Harmoni: null,
      "HARMONI PANADERIA": null,
      "Panadería Hermoni": null,
      "HARMONI LUCRECIA": "Lucrecia",
      "HARMONI SUR CANDELADRIA": "Sur Candelaria",
      "HARMONI SUR CANDELARIA": "Sur Candelaria",
    },
  },
  {
    target: "Meridianos Villa Alsacia",
    members: {
      "PANADERIA MERDIANOS VILLA ALSACIA": null,
      "PANADERIA MERIDIANOS": null,
      "MERIDIANOS VILLA DEL RIO": "Villa del Río",
      "PANADERIA MERIDIANOS VILLA DEL RIO": "Villa del Río",
    },
  },
  {
    target: "Williz Modelia",
    members: {
      "Williz Villa Luz": "Villa Luz",
      "WILLIZ PIZZA VILLA LUZ": "Villa Luz",
      "Williz Pizza Villa De Madrigal": "Villas del Madrigal",
      "Williz Villas Del Madrigal": "Villas del Madrigal",
    },
  },
  {
    target: "Muffins Y Panes SAS",
    members: {
      "Muffins y panes": null,
      "MUFFINS Y PANES S.A.S": null,
      "muffins cedritos": "Cedritos",
      "muffins pasadena": "Pasadena",
    },
  },
  {
    target: "HASBLUE SUSHI S.A.S.",
    members: { HASBLUE: null, "HASBLUE MOSQUERA": "Mosquera" },
  },
  {
    target: "Picar Market & Coffe",
    members: {
      "Picar market": null,
      "picar market and coffe": null,
      "picar market and coffe norte": "Norte",
    },
  },
  {
    target: "Bake My Day SAS",
    members: { "bake my day": null, "BAKE MY DAY MALL PLAZA": "Mall Plaza" },
  },
  { target: "Riverinos", members: { "riverinos la calera": "La Calera" } },
  {
    target: "PORTAL DE LA EMPANADA",
    members: { "Portal De La Empanada Restrepo": "Restrepo" },
  },
];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

type ClientRow = Awaited<ReturnType<typeof loadClients>>[number];

const loadClients = () =>
  prisma.client.findMany({
    include: {
      addresses: true,
      contacts: true,
      _count: { select: { quotes: true, orders: true, opportunities: true, activities: true, conversations: true } },
    },
  });

async function main() {
  console.log(`Base: ${new URL(process.env.DATABASE_URL ?? "").host}${APPLY ? "  (ESCRIBE)" : "  (simulación)"}`);

  const clients = await loadClients();
  const byName = new Map<string, ClientRow[]>();
  for (const client of clients) {
    const key = normalize(client.businessName);
    byName.set(key, [...(byName.get(key) ?? []), client]);
  }
  const find = (name: string): ClientRow => {
    const found = byName.get(normalize(name)) ?? [];
    if (found.length !== 1) {
      throw new Error(`"${name}": se esperaba exactamente una ficha y hay ${found.length}. Nada se escribió.`);
    }
    return found[0];
  };

  // Resolver todo antes de escribir: si algo no calza, se aborta entero.
  const plan = CHAINS.map((chain) => {
    const target = find(chain.target);
    const members = Object.entries(chain.members).map(([name, label]) => {
      const member = find(name);
      if (member.id === target.id) throw new Error(`"${name}" es la misma ficha que el principal.`);
      return { member, label };
    });
    return { chain, target, members };
  });

  const seen = new Set<string>();
  for (const { members } of plan) {
    for (const { member } of members) {
      if (seen.has(member.id)) throw new Error(`"${member.businessName}" aparece en dos cadenas.`);
      seen.add(member.id);
    }
  }

  for (const { chain, target, members } of plan) {
    const quotes = members.reduce((sum, m) => sum + m.member._count.quotes, 0) + target._count.quotes;
    const sedes = new Set(members.flatMap((m) => (m.label ? [m.label] : [])));
    console.log(
      `\n${chain.rename ?? target.businessName}  ← ${members.length} fichas · ${quotes} cotizaciones · ${sedes.size} sedes nuevas`,
    );
    for (const { member, label } of members) {
      const extra = member._count.orders + member._count.opportunities + member._count.activities + member._count.conversations;
      console.log(
        `   ${member.businessName} → ${label ? `sede "${label}"` : "misma sede"}  (${member._count.quotes} cot.${extra ? `, ${extra} otros registros` : ""})`,
      );
    }
  }

  if (!APPLY) {
    const total = plan.reduce((sum, p) => sum + p.members.length, 0);
    console.log(`\nSimulación: ${total} fichas se fusionarían en ${plan.length} clientes. Nada se escribió.`);
    return;
  }

  // Respaldo de lo que se va a borrar.
  const backup = plan.flatMap((p) => p.members.map((m) => ({ mergedInto: p.target.id, ...m.member })));
  writeFileSync(BACKUP, JSON.stringify(backup, null, 2));
  console.log(`\nRespaldo: ${BACKUP} (${backup.length} fichas)`);

  for (const { chain, target, members } of plan) {
    await prisma.$transaction(
      async (tx) => {
        const addresses = new Map(
          (await tx.clientAddress.findMany({ where: { clientId: target.id } })).map((a) => [normalize(a.label), a]),
        );
        const primary = target.addresses.find((a) => a.isPrimary) ?? target.addresses[0];
        const known = { phone: target.phone, email: target.email, nit: target.nit, ownerId: target.ownerId };
        const targetWhatsapp = new Set(target.contacts.map((c) => c.whatsappE164).filter(Boolean));
        const notes: string[] = [];

        for (const { member, label } of members) {
          // Sede de destino
          let addressId: string | null = primary?.id ?? null;
          if (label) {
            let sede = addresses.get(normalize(label));
            if (!sede) {
              const own = member.addresses[0];
              sede = own
                ? await tx.clientAddress.update({
                    where: { id: own.id },
                    data: { clientId: target.id, label, isPrimary: false },
                  })
                : await tx.clientAddress.create({
                    data: { clientId: target.id, label, address: "Por confirmar", isPrimary: false },
                  });
              addresses.set(normalize(label), sede);
            }
            addressId = sede.id;
          }

          // Contactos: los de un número que el principal ya tiene no se repiten.
          for (const contact of member.contacts) {
            if (contact.whatsappE164 && targetWhatsapp.has(contact.whatsappE164)) continue;
            if (contact.whatsappE164) targetWhatsapp.add(contact.whatsappE164);
            await tx.contact.update({ where: { id: contact.id }, data: { clientId: target.id, isPrimary: false } });
          }

          await tx.quote.updateMany({ where: { clientId: member.id }, data: { clientId: target.id, addressId } });
          await tx.order.updateMany({ where: { clientId: member.id }, data: { clientId: target.id } });
          await tx.opportunity.updateMany({ where: { clientId: member.id }, data: { clientId: target.id } });
          await tx.activity.updateMany({ where: { clientId: member.id }, data: { clientId: target.id } });
          await tx.whatsappConversation.updateMany({ where: { clientId: member.id }, data: { clientId: target.id } });

          // Completar lo que le falta al principal.
          const fill: Record<string, string> = {};
          if (!known.phone && member.phone) fill.phone = known.phone = member.phone;
          if (!known.email && member.email) fill.email = known.email = member.email;
          if (!known.ownerId && member.ownerId) fill.ownerId = known.ownerId = member.ownerId;
          const takesNit = !known.nit && member.nit;
          // El NIT es único: se libera en la ficha que se borra antes de pasarlo.
          if (takesNit) {
            await tx.client.update({ where: { id: member.id }, data: { nit: null, nitDv: null } });
            fill.nit = known.nit = member.nit!;
            if (member.nitDv) fill.nitDv = member.nitDv;
          }
          if (Object.keys(fill).length > 0) await tx.client.update({ where: { id: target.id }, data: fill });

          notes.push(member.businessName);
          await tx.client.delete({ where: { id: member.id } });
        }

        const merged = `Fusionado desde: ${notes.join(", ")}.`;
        await tx.client.update({
          where: { id: target.id },
          data: {
            ...(chain.rename ? { businessName: chain.rename } : {}),
            notes: [target.notes, merged].filter(Boolean).join("\n"),
          },
        });
      },
      { timeout: 60000 },
    );
    console.log(`  ✓ ${chain.rename ?? target.businessName}`);
  }
  console.log("\nEscrito.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
