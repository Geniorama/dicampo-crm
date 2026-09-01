import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Configuración del CLI de Prisma.
 *
 * El CLI (migraciones, seed, studio) usa `DIRECT_URL`: la conexión directa de
 * Supabase en el puerto 5432. Las migraciones no pueden correr a través de
 * PgBouncer en modo transacción porque necesitan sentencias con estado.
 *
 * El runtime de la aplicación usa `DATABASE_URL` (pooler, puerto 6543) desde
 * `src/server/db.ts`, que es lo adecuado para funciones serverless.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
