import type { Prisma } from "@/generated/prisma/client";

/**
 * Serializa dentro de una transacción las operaciones sobre la misma llave
 * (un teléfono, la rotación de vendedores). Es un candado de Postgres que se
 * suelta solo al terminar la transacción, así que funciona detrás de
 * PgBouncer en modo transacción.
 */
export async function lockKey(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
