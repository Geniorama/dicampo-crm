import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente de Prisma compartido, creado de forma perezosa.
 *
 * La instancia no se construye al importar el módulo, sino en el primer acceso
 * real a la base. Así, importar un servicio para probar su lógica pura —o para
 * que Next.js recolecte los datos de una página— no abre una conexión ni exige
 * tener configurado `DATABASE_URL`.
 *
 * En desarrollo se guarda en `globalThis` porque el hot-reload reevalúa este
 * módulo en cada cambio y, sin el singleton, se agotaría el pool de Postgres.
 * En producción serverless, mantenerlo en el ámbito del módulo permite
 * reutilizarlo entre invocaciones de la misma función.
 *
 * Prisma 7 eliminó el motor Rust: la conexión pasa por el driver adapter de
 * `pg`, así que no hacen falta binarios nativos en el bundle de Netlify.
 */

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Copia .env.example a .env y configura la conexión de Supabase.",
    );
  }

  // `connection_limit=1` en la URL del pooler evita que cada instancia de la
  // función abra varias conexiones contra PgBouncer.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Proxy que difiere la creación del cliente hasta el primer uso. Los métodos
 * se enlazan a la instancia real para no perder su `this`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});
