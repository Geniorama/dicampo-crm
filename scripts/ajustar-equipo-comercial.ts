import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Ajustes de usuarios pedidos por Dicampo (noviembre 2026):
 *
 *  1. Marca quién cuenta en metas / ventas del equipo (`inSalesTeam`) y quién
 *     puede ser «Asesor» de una cotización (`canBeSeller`).
 *       - Karen: no cuenta en metas, pero sigue pudiendo subir pedidos de
 *         superdistribuidores.
 *       - Cartera, Contabilidad, Gerencia, Marketing y TEST COMERCIAL: ni una
 *         cosa ni la otra.
 *  2. Fusiona usuarios duplicados por tilde (Andres/Andrés, Fabian/Fabián):
 *     conserva el nombre con tilde, mueve a él todo lo que apuntaba al otro
 *     (en cualquier tabla con llave a User) y desactiva el duplicado.
 *
 * Por defecto solo informa. Escribe con `--aplicar`. Es idempotente.
 * Con `--desactivar` además desactiva las cuentas que ya no son asesores
 * (no se borran: sus datos necesitan autor).
 *
 *   npx tsx scripts/ajustar-equipo-comercial.ts
 *   npx tsx scripts/ajustar-equipo-comercial.ts --aplicar [--desactivar]
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--aplicar");
const DEACTIVATE = process.argv.includes("--desactivar");

const norm = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const FIRST_NAME_OUT_OF_TEAM = new Set(["karen"]);
const NOT_ADVISORS = new Set(["cartera", "contabilidad", "gerencia", "marketing", "test comercial"]);

async function main() {
  console.log(APPLY ? "== APLICANDO ==" : "== DIAGNÓSTICO (usa --aplicar para escribir) ==");

  const users = await prisma.user.findMany({
    where: { role: { not: "AGENTE_IA" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, active: true, role: true },
  });

  // 1. Marcas por usuario.
  for (const user of users) {
    const key = norm(user.name);
    const notAdvisor = NOT_ADVISORS.has(key);
    const outOfTeam = notAdvisor || FIRST_NAME_OUT_OF_TEAM.has(key.split(/\s+/)[0]);
    if (!notAdvisor && !outOfTeam) continue;
    console.log(
      `· ${user.name} (${user.role}): inSalesTeam=false, canBeSeller=${!notAdvisor}` +
        (DEACTIVATE && notAdvisor ? ", se desactiva" : ""),
    );
    if (APPLY) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          inSalesTeam: false,
          canBeSeller: !notAdvisor,
          ...(DEACTIVATE && notAdvisor ? { active: false } : {}),
        },
      });
    }
  }

  // 2. Duplicados por tilde/mayúsculas entre usuarios activos.
  const groups = new Map<string, typeof users>();
  for (const user of users.filter((u) => u.active)) {
    const key = norm(user.name);
    groups.set(key, [...(groups.get(key) ?? []), user]);
  }

  const refs = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      AND ccu.table_name = 'User' AND ccu.column_name = 'id'`;

  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Se conserva el que tiene tilde (el nombre bien escrito).
    const keeper = group.find((u) => /[^\x00-\x7f]/.test(u.name)) ?? group[0];
    for (const dup of group.filter((u) => u.id !== keeper.id)) {
      console.log(`· Fusionar «${dup.name}» <${dup.email}> → «${keeper.name}» <${keeper.email}>`);
      for (const ref of refs) {
        const [{ count }] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*) AS count FROM "${ref.table_name}" WHERE "${ref.column_name}" = $1`,
          dup.id,
        );
        if (Number(count) > 0) console.log(`    ${ref.table_name}.${ref.column_name}: ${count}`);
      }
      if (!APPLY) continue;

      await prisma.$transaction(async (tx) => {
        for (const ref of refs) {
          const table = `"${ref.table_name}"`;
          const col = `"${ref.column_name}"`;
          await tx.$executeRawUnsafe("SAVEPOINT mover");
          try {
            await tx.$executeRawUnsafe(`UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`, keeper.id, dup.id);
          } catch {
            // Llave única (horario, meta del mes…): el conservado ya tiene la suya.
            await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT mover");
            await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE ${col} = $1`, dup.id);
          }
        }
        await tx.user.update({ where: { id: dup.id }, data: { active: false } });
      });
    }
  }

  // 3. Etiquetas de las estadísticas manuales sin tilde → nombre del usuario.
  const labels = await prisma.manualStat.findMany({
    where: { metric: "CLIENTES_NUEVOS" },
    select: { id: true, label: true },
  });
  const firstNames = new Map(
    users.filter((u) => u.active).map((u) => [norm(u.name.split(" ")[0]), u.name.split(" ")[0]]),
  );
  for (const row of labels) {
    const fixed = firstNames.get(norm(row.label));
    if (!fixed || fixed === row.label) continue;
    console.log(`· Estadística manual: «${row.label}» → «${fixed}»`);
    if (APPLY) await prisma.manualStat.update({ where: { id: row.id }, data: { label: fixed } });
  }

  console.log(APPLY ? "Listo." : "Nada se escribió. Revisa y corre con --aplicar.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
