import { prisma } from "../db";
import { BusinessRuleError, ConflictError, NotFoundError } from "../errors";
import type { ZoneCreateInput, ZoneUpdateInput } from "../validators/zones";

/**
 * Zonas de entrega: la división amplia de Bogotá con que se arman las rutas
 * y se clasifica cada sede (la localidad, más fina, vive en la sede).
 *
 * Solo ADMIN las gestiona; lo exigen las rutas. No se borran: sedes y rutas
 * las referencian. Desactivar una la saca de los selectores, pero lo que ya
 * la tiene la conserva.
 */

/** Todas, con cuánto las usa: ayuda a decidir antes de desactivar. */
export async function listZones() {
  return prisma.deliveryZone.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      active: true,
      _count: {
        select: {
          addresses: { where: { active: true } },
          routes: true,
        },
      },
    },
  });
}

/** El nombre es único sin importar mayúsculas: "norte" y "Norte" serían la misma. */
async function assertNameIsFree(name: string, exceptId?: string) {
  const clash = await prisma.deliveryZone.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { active: true },
  });
  if (clash) {
    throw new ConflictError(
      clash.active
        ? `Ya existe la zona "${name}".`
        : `Ya existe la zona "${name}", inactiva: actívala en vez de crearla de nuevo.`,
    );
  }
}

export async function createZone(input: ZoneCreateInput) {
  await assertNameIsFree(input.name);
  return prisma.deliveryZone.create({ data: input });
}

export async function updateZone(id: string, input: ZoneUpdateInput) {
  const zone = await prisma.deliveryZone.findUnique({ where: { id }, select: { id: true } });
  if (!zone) throw new NotFoundError("La zona");

  if (input.name) await assertNameIsFree(input.name, id);

  return prisma.deliveryZone.update({ where: { id }, data: input });
}

/**
 * Una zona inactiva no se asigna de nuevo. Lo que ya la tenía la conserva:
 * reenviar la misma zona al editar una sede o una ruta no es asignarla.
 */
export async function assertZoneAssignable(
  zoneId: string | null | undefined,
  currentZoneId?: string | null,
) {
  if (!zoneId || zoneId === currentZoneId) return;

  const zone = await prisma.deliveryZone.findUnique({
    where: { id: zoneId },
    select: { name: true, active: true },
  });
  if (!zone) throw new NotFoundError("La zona");
  if (!zone.active) {
    throw new BusinessRuleError(`La zona "${zone.name}" está inactiva: elige otra.`);
  }
}
