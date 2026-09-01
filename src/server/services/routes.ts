import { prisma } from "../db";
import { BusinessRuleError, NotFoundError } from "../errors";
import { OrderStatus, RouteStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "../guards";
import type {
  DeliveryProofInput,
  RouteCreateInput,
  RouteListQuery,
  RouteOrdersInput,
  RouteStatusInput,
  RouteUpdateInput,
} from "../validators/routes";

/**
 * Rutas de reparto.
 *
 * Una ruta agrupa los pedidos de un día en un orden de visita. Su estado
 * arrastra el de los pedidos que lleva, porque describen el mismo hecho:
 *
 * - Poner la ruta EN_RUTA marca sus pedidos como DESPACHADO — salieron de
 *   bodega en ese camión.
 * - Cada entrega se registra por pedido, con su evidencia, y lo pasa a
 *   ENTREGADO.
 * - La ruta se COMPLETA cuando ya no le queda ningún pedido pendiente.
 *
 * Solo se pueden montar en una ruta pedidos que ya descontaron inventario
 * (CONFIRMADO o EN_PREPARACION): despachar algo sin stock reservado sería
 * prometer mercancía que no existe.
 */

/** Estados de pedido que pueden montarse en una ruta. */
const ASSIGNABLE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMADO,
  OrderStatus.EN_PREPARACION,
];

/** Transiciones válidas de una ruta. */
const ALLOWED_ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  PLANEADA: [RouteStatus.EN_RUTA, RouteStatus.CANCELADA],
  EN_RUTA: [RouteStatus.COMPLETADA, RouteStatus.CANCELADA],
  COMPLETADA: [],
  CANCELADA: [],
};

export function canTransitionRoute(from: RouteStatus, to: RouteStatus): boolean {
  return ALLOWED_ROUTE_TRANSITIONS[from].includes(to);
}

export function nextRouteStatuses(from: RouteStatus): RouteStatus[] {
  return ALLOWED_ROUTE_TRANSITIONS[from];
}

export async function listRoutes(query: RouteListQuery) {
  const { status, zoneId, driverId, from, to } = query;

  return prisma.deliveryRoute.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(zoneId ? { zoneId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: [{ date: "desc" }, { name: "asc" }],
    include: {
      zone: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true } },
      _count: { select: { orders: true } },
    },
  });
}

export async function getRoute(id: string) {
  const route = await prisma.deliveryRoute.findUnique({
    where: { id },
    include: {
      zone: { select: { id: true, name: true } },
      driver: { select: { id: true, name: true } },
      orders: {
        orderBy: [{ routeSequence: "asc" }],
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          routeSequence: true,
          requestedDeliveryDate: true,
          client: { select: { id: true, businessName: true, tradeName: true, phone: true } },
          address: {
            select: {
              id: true,
              label: true,
              address: true,
              neighborhood: true,
              deliveryNotes: true,
              zone: { select: { id: true, name: true } },
            },
          },
          proof: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!route) throw new NotFoundError("La ruta");
  return route;
}

/** Pedidos listos para despachar que aún no están en ninguna ruta. */
export async function listAssignableOrders(zoneId?: string | null) {
  return prisma.order.findMany({
    where: {
      status: { in: ASSIGNABLE_STATUSES },
      routeId: null,
      // Si la ruta cubre una zona, se ofrecen primero los de esa zona.
      ...(zoneId ? { address: { zoneId } } : {}),
    },
    orderBy: [{ requestedDeliveryDate: "asc" }, { orderNumber: "asc" }],
    select: {
      id: true,
      orderNumber: true,
      total: true,
      requestedDeliveryDate: true,
      client: { select: { businessName: true, tradeName: true } },
      address: {
        select: {
          label: true,
          address: true,
          zone: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createRoute(input: RouteCreateInput) {
  if (input.driverId) {
    const driver = await prisma.user.findUnique({
      where: { id: input.driverId },
      select: { active: true },
    });
    if (!driver?.active) {
      throw new BusinessRuleError("El repartidor asignado no está activo.");
    }
  }

  return prisma.deliveryRoute.create({ data: input });
}

export async function updateRoute(id: string, input: RouteUpdateInput) {
  const route = await prisma.deliveryRoute.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!route) throw new NotFoundError("La ruta");

  if (route.status === RouteStatus.COMPLETADA || route.status === RouteStatus.CANCELADA) {
    throw new BusinessRuleError("Una ruta cerrada ya no se puede modificar.");
  }

  return prisma.deliveryRoute.update({ where: { id }, data: input });
}

/**
 * Fija los pedidos de la ruta y su orden de visita.
 *
 * Reemplaza la asignación completa: los que ya no vienen en la lista se
 * liberan para poder montarse en otra ruta.
 */
export async function setRouteOrders(id: string, input: RouteOrdersInput) {
  const route = await prisma.deliveryRoute.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!route) throw new NotFoundError("La ruta");

  if (route.status !== RouteStatus.PLANEADA) {
    throw new BusinessRuleError(
      "Solo se pueden reorganizar los pedidos de una ruta en planeación.",
    );
  }

  if (input.orderIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { id: { in: input.orderIds } },
      select: { id: true, orderNumber: true, status: true, routeId: true },
    });

    if (orders.length !== input.orderIds.length) {
      throw new BusinessRuleError("Alguno de los pedidos ya no existe.");
    }

    const notDispatchable = orders.filter(
      (order) => !ASSIGNABLE_STATUSES.includes(order.status),
    );
    if (notDispatchable.length > 0) {
      throw new BusinessRuleError(
        `El pedido ${notDispatchable[0].orderNumber} no está confirmado: no ha descontado inventario.`,
      );
    }

    const takenByAnother = orders.filter(
      (order) => order.routeId !== null && order.routeId !== id,
    );
    if (takenByAnother.length > 0) {
      throw new BusinessRuleError(
        `El pedido ${takenByAnother[0].orderNumber} ya está asignado a otra ruta.`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // Se sueltan los que salieron de la ruta…
    await tx.order.updateMany({
      where: { routeId: id, id: { notIn: input.orderIds } },
      data: { routeId: null, routeSequence: null },
    });

    // …y se renumera el recorrido de los que quedan.
    for (const [index, orderId] of input.orderIds.entries()) {
      await tx.order.update({
        where: { id: orderId },
        data: { routeId: id, routeSequence: index + 1 },
      });
    }

    return tx.deliveryRoute.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { orders: true } } },
    });
  });
}

/**
 * Cambia el estado de la ruta y arrastra el de sus pedidos.
 *
 * Salir a ruta despacha; cancelarla devuelve los pedidos a preparación para
 * que puedan reprogramarse en otro reparto.
 */
export async function changeRouteStatus(
  user: SessionUser,
  id: string,
  input: RouteStatusInput,
) {
  const route = await prisma.deliveryRoute.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      orders: { select: { id: true, status: true, orderNumber: true } },
    },
  });
  if (!route) throw new NotFoundError("La ruta");

  if (route.status === input.status) return route;

  if (!canTransitionRoute(route.status, input.status)) {
    throw new BusinessRuleError(
      `No se puede pasar una ruta de "${route.status}" a "${input.status}".`,
    );
  }

  if (input.status === RouteStatus.EN_RUTA && route.orders.length === 0) {
    throw new BusinessRuleError("La ruta no tiene pedidos asignados.");
  }

  if (input.status === RouteStatus.COMPLETADA) {
    const pending = route.orders.filter(
      (order) =>
        order.status !== OrderStatus.ENTREGADO &&
        order.status !== OrderStatus.CANCELADO,
    );
    if (pending.length > 0) {
      throw new BusinessRuleError(
        `Faltan ${pending.length} ${pending.length === 1 ? "entrega" : "entregas"} por registrar (empezando por el ${pending[0].orderNumber}).`,
      );
    }
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    if (input.status === RouteStatus.EN_RUTA) {
      // Salieron de bodega en este camión.
      await tx.order.updateMany({
        where: { routeId: id, status: { in: ASSIGNABLE_STATUSES } },
        data: { status: OrderStatus.DESPACHADO },
      });
    }

    if (input.status === RouteStatus.CANCELADA) {
      // Los pedidos vuelven a estar disponibles para otra ruta; el inventario
      // sigue reservado, así que se dejan en preparación, no se cancelan.
      await tx.order.updateMany({
        where: {
          routeId: id,
          status: { in: [...ASSIGNABLE_STATUSES, OrderStatus.DESPACHADO] },
        },
        data: {
          status: OrderStatus.EN_PREPARACION,
          routeId: null,
          routeSequence: null,
        },
      });
    }

    return tx.deliveryRoute.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.reason ? { notes: input.reason } : {}),
        updatedAt: now,
      },
    });
  });
}

/**
 * Registra la entrega de un pedido con su evidencia y lo marca ENTREGADO.
 * Si con esta cae la última pendiente, la ruta se cierra sola.
 */
export async function registerDelivery(
  user: SessionUser,
  orderId: string,
  input: DeliveryProofInput,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, routeId: true, orderNumber: true },
  });
  if (!order) throw new NotFoundError("El pedido");

  if (order.status !== OrderStatus.DESPACHADO) {
    throw new BusinessRuleError(
      "Solo se puede registrar la entrega de un pedido que ya salió a ruta.",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.deliveryProof.upsert({
      where: { orderId },
      update: { ...input, deliveredAt: now },
      create: { ...input, orderId, deliveredAt: now },
    });

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.ENTREGADO, deliveredAt: now },
    });

    if (order.routeId) {
      const pending = await tx.order.count({
        where: {
          routeId: order.routeId,
          status: { notIn: [OrderStatus.ENTREGADO, OrderStatus.CANCELADO] },
        },
      });

      if (pending === 0) {
        await tx.deliveryRoute.update({
          where: { id: order.routeId },
          data: { status: RouteStatus.COMPLETADA },
        });
      }
    }

    return updated;
  });
}
