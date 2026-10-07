import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { UserRole } from "../src/generated/prisma/enums";

/**
 * Diagnostica y, si se pide, restablece la contraseña del administrador.
 *
 * Existe porque `prisma/seed.ts` **no** pisa la contraseña de un usuario que
 * ya existe: su `upsert` solo actualiza rol y estado, para no revertir un
 * cambio de clave hecho desde la aplicación. Esa decisión es correcta, pero
 * deja un hueco — si la base se sembró con una `SEED_ADMIN_PASSWORD` y luego
 * el `.env` cambia, volver a sembrar no devuelve el acceso y no queda forma
 * de entrar. Esto lo resuelve.
 *
 * Por defecto solo informa. Escribe únicamente con `--aplicar`, porque
 * cambiar la contraseña de administración de producción no es algo que deba
 * pasar por teclear un comando de más.
 *
 *   npm run clave:admin                      # diagnóstico
 *   npm run clave:admin -- --aplicar         # restablece desde .env
 *
 * Para apuntar a otra base, antepón la conexión sin tocar el `.env`:
 *
 *   DIRECT_URL='postgresql://…:5432/postgres' npm run clave:admin
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--aplicar");

function host(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host;
  } catch {
    return "(conexión no válida)";
  }
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Faltan SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD. Revisa tu archivo .env.",
    );
  }

  console.log(`Base: ${host()}`);
  console.log(`Administrador buscado: ${email}\n`);

  const users = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
      active: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { email: "asc" },
  });

  if (users.length === 0) {
    console.log("No hay ningún usuario: la base no está sembrada.");
    console.log("Ejecuta `npm run db:seed` contra esta conexión.");
    return;
  }

  console.log("Usuarios registrados:");
  for (const user of users) {
    const matches = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    console.log(
      `  ${user.email.padEnd(24)} ${user.role.padEnd(9)} activo=${user.active ? "sí" : "no"} ` +
        `creado=${user.createdAt.toISOString().slice(0, 10)} ` +
        `coincide con SEED_ADMIN_PASSWORD=${matches ? "sí" : "NO"}`,
    );
  }

  const admin = users.find((user) => user.email === email);

  if (!admin) {
    console.log(`\nNo existe ningún usuario con el correo ${email}.`);
    return;
  }

  if (await bcrypt.compare(password, admin.passwordHash ?? "")) {
    console.log("\nLa contraseña del .env ya es la buena: no hay nada que hacer.");
    console.log("Si aun así no entras, el problema no es la credencial.");
    return;
  }

  if (!APPLY) {
    console.log(
      "\nLa contraseña guardada NO corresponde a la del .env. Para alinearlas:",
    );
    console.log("  npm run clave:admin -- --aplicar");
    return;
  }

  await prisma.user.update({
    where: { email },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      // Un administrador desactivado tampoco podría entrar.
      active: true,
      role: UserRole.ADMIN,
    },
  });

  const updated = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { passwordHash: true },
  });

  console.log(
    `\nContraseña restablecida. Verificación: ${
      (await bcrypt.compare(password, updated.passwordHash ?? "")) ? "correcta" : "FALLÓ"
    }`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
