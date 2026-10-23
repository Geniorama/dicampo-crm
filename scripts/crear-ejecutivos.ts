import "dotenv/config";
import { randomInt } from "node:crypto";
import { prisma } from "../src/server/db";
import { createUser } from "../src/server/services/users";
import { userCreateSchema } from "../src/server/validators/users";

/**
 * Crea las cuentas genéricas de los asesores comerciales ("Vendedor 1",
 * "Vendedor 2"…, con el correo ejecutivocomercialN@dicampo.co). La rotación es
 * alta: cada persona pone su nombre en "Mi perfil" y cambia la contraseña.
 *
 * Por defecto solo informa. Crea únicamente con `--aplicar`. Es idempotente:
 * una cuenta que ya existe se omite (y no se toca su contraseña).
 *
 *   npx tsx scripts/crear-ejecutivos.ts 3
 *   npx tsx scripts/crear-ejecutivos.ts 3 --aplicar
 *
 * Imprime las contraseñas iniciales una sola vez: no se guardan en claro.
 */

const args = process.argv.slice(2);
const COUNT = Number(args.find((arg) => /^\d+$/.test(arg)) ?? "3");
const APPLY = args.includes("--aplicar");
const DOMAIN = "dicampo.co";

/** Sin 0/O ni 1/l/I: se la van a dictar por teléfono o WhatsApp. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makePassword = () =>
  Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  console.log(`Base: ${url.host}${url.pathname}\n`);

  for (let n = 1; n <= COUNT; n += 1) {
    const email = `ejecutivocomercial${n}@${DOMAIN}`;
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (existing) {
      console.log(`  omitida  ${email} (ya existe)`);
      continue;
    }
    if (!APPLY) {
      console.log(`  crearía  ${email} · Vendedor ${n}`);
      continue;
    }

    const password = makePassword();
    const input = userCreateSchema.parse({
      name: `Vendedor ${n}`,
      email,
      password,
      role: "VENDEDOR",
    });
    await createUser(input);
    console.log(`  creada   ${email} · Vendedor ${n} · contraseña inicial: ${password}`);
  }

  if (!APPLY) console.log("\nAgrega --aplicar para crear.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
