import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { contactWhatsappKey } from "../src/lib/whatsapp";

/**
 * Llena `Contact.whatsappE164` en los contactos que ya existían antes de la
 * migración del agente IA.
 *
 * El agente encuentra a un cliente buscando su número por igualdad en ese
 * campo. Los contactos nuevos lo reciben del servicio de clientes; los
 * anteriores solo tienen `whatsapp` y `phone` escritos a mano, en cualquier
 * formato, y necesitan esta pasada una vez.
 *
 * Por defecto solo informa. Escribe únicamente con `--aplicar`. Es
 * idempotente: se puede correr varias veces.
 *
 *   npx tsx scripts/normalizar-whatsapp.ts             # diagnóstico
 *   npx tsx scripts/normalizar-whatsapp.ts --aplicar   # escribe
 *
 * También reporta números repetidos entre clientes distintos: el agente
 * no podría decidir a cuál de ellos pertenece una conversación.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--aplicar");

async function main() {
  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      whatsapp: true,
      phone: true,
      whatsappE164: true,
      active: true,
      client: { select: { id: true, businessName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const changes: { id: string; key: string | null }[] = [];
  let withoutNumber = 0;
  const byKey = new Map<string, Set<string>>();

  for (const contact of contacts) {
    const key = contactWhatsappKey(contact);
    if (!key) withoutNumber += 1;
    if (key !== contact.whatsappE164) changes.push({ id: contact.id, key });

    if (key && contact.active) {
      const clients = byKey.get(key) ?? new Set<string>();
      clients.add(contact.client.businessName);
      byKey.set(key, clients);
    }
  }

  console.log(`Contactos revisados: ${contacts.length}`);
  console.log(`Por actualizar: ${changes.length}`);
  console.log(`Sin número utilizable: ${withoutNumber}`);

  const shared = [...byKey].filter(([, clients]) => clients.size > 1);
  if (shared.length > 0) {
    console.log(`\nNúmeros compartidos por varios clientes (${shared.length}):`);
    for (const [key, clients] of shared) {
      console.log(`  ${key}: ${[...clients].join(" · ")}`);
    }
    console.log(
      "  El agente asociará la conversación al cliente con actividad más reciente.",
    );
  }

  if (!APPLY) {
    console.log("\nModo diagnóstico: no se escribió nada. Usa --aplicar para guardar.");
    return;
  }

  for (const { id, key } of changes) {
    await prisma.contact.update({ where: { id }, data: { whatsappE164: key } });
  }
  console.log(`\nListo: ${changes.length} contactos actualizados.`);
}

main()
  .catch((error) => {
    console.error("Falló la normalización:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
