import { prisma } from "../db";
import type { Prisma } from "@/generated/prisma/client";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../errors";
import { OrderStatus, RouteStatus, UserRole } from "@/generated/prisma/enums";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";
import type { SessionUser } from "../guards";
import { recordPayment } from "./receivables";
import type {
  DeliveryFailureInput,
  DeliveryProofInput,
  DispatchNotesInput,
  RouteCreateInput,
  RouteListQuery,
  RouteOrdersInput,
  RouteStatusInput,
  RouteUpdateInput,
} from "../validators/routes";
import { isoWeekday } from "@/lib/route-schedule";
import { materializeScheduledRoutes } from "./route-schedules";
import { assertZoneAssignable } from "./zones";

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
  await materializeScheduledRoutes(todayInBogota());

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
          collectionNote: true,
          giftNote: true,
          arrivedAt: true,
          deliveredAt: true,
          client: { select: { id: true, businessName: true, tradeName: true, phone: true } },
          address: {
            select: {
              id: true,
              label: true,
              address: true,
              neighborhood: true,
              locality: true,
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
          locality: true,
          zone: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createRoute(input: RouteCreateInput) {
  await assertZoneAssignable(input.zoneId);
  if (input.driverId) {
    const driver = await prisma.user.findUnique({
      where: { id: input.driverId },
      select: { active: true },
    });
    if (!driver?.active) {
      throw new BusinessRuleError("El repartidor asignado no está activo.");
    }
  }

  const { repeatWeekly, ...data } = input;
  if (!repeatWeekly) return prisma.deliveryRoute.create({ data });

  // Repetida: la programación nace con la ruta y esta es su primera fecha.
  const route = await prisma.$transaction(async (tx) => {
    const schedule = await tx.routeSchedule.create({
      data: {
        name: data.name,
        weekday: isoWeekday(data.date.toISOString().slice(0, 10)),
        startsOn: data.date,
        zoneId: data.zoneId,
        driverId: data.driverId,
        vehicle: data.vehicle,
        notes: data.notes,
      },
    });
    return tx.deliveryRoute.create({ data: { ...data, scheduleId: schedule.id } });
  });
  await materializeScheduledRoutes(todayInBogota());
  return route;
}

export async function updateRoute(id: string, input: RouteUpdateInput) {
  const route = await prisma.deliveryRoute.findUnique({
    where: { id },
    select: { status: true, zoneId: true },
  });
  if (!route) throw new NotFoundError("La ruta");

  if (route.status === RouteStatus.COMPLETADA || route.status === RouteStatus.CANCELADA) {
    throw new BusinessRuleError("Una ruta cerrada ya no se puede modificar.");
  }
  await assertZoneAssignable(input.zoneId, route.zoneId);

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
      driverId: true,
      orders: { select: { id: true, status: true, orderNumber: true } },
    },
  });
  if (!route) throw new NotFoundError("La ruta");
  assertCanWorkRoute(user, route.driverId);

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
        ...(input.status === RouteStatus.EN_RUTA ? { startedAt: now } : {}),
        ...(input.status === RouteStatus.COMPLETADA ? { completedAt: now } : {}),
        updatedAt: now,
      },
    });
  });
}

/**
 * Un repartidor (DESPACHO) solo trabaja las rutas que tiene asignadas; las
 * que no tienen repartidor las puede atender cualquiera de despacho. BODEGA y
 * ADMIN no tienen esa restricción.
 */
function assertCanWorkRoute(user: SessionUser, driverId: string | null | undefined) {
  if (user.role === UserRole.DESPACHO && driverId && driverId !== user.id) {
    throw new ForbiddenError("Esta ruta está asignada a otro repartidor.");
  }
}

/** Pedido en reparto, con lo necesario para validar quién puede tocarlo. */
async function getOrderInRoute(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      routeId: true,
      orderNumber: true,
      arrivedAt: true,
      route: { select: { driverId: true } },
    },
  });
  if (!order) throw new NotFoundError("El pedido");
  return order;
}

/** Cierra la ruta si ya no le queda ninguna parada pendiente. */
async function completeRouteIfDone(
  tx: Prisma.TransactionClient,
  routeId: string | null,
  now: Date,
) {
  if (!routeId) return;

  const pending = await tx.order.count({
    where: {
      routeId,
      status: { notIn: [OrderStatus.ENTREGADO, OrderStatus.CANCELADO] },
    },
  });

  if (pending === 0) {
    await tx.deliveryRoute.update({
      where: { id: routeId },
      data: { status: RouteStatus.COMPLETADA, completedAt: now },
    });
  }
}

/**
 * El repartidor marca que llegó a la parada. Es idempotente: la primera marca
 * manda, para que tocar el botón dos veces no mueva la hora.
 */
export async function markArrival(user: SessionUser, orderId: string) {
  const order = await getOrderInRoute(orderId);
  assertCanWorkRoute(user, order.route?.driverId);

  if (order.status !== OrderStatus.DESPACHADO) {
    throw new BusinessRuleError(
      "Solo se puede llegar a una parada de un pedido que ya salió a ruta.",
    );
  }
  if (order.arrivedAt) return { arrivedAt: order.arrivedAt };

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { arrivedAt: new Date() },
    select: { arrivedAt: true },
  });
  return { arrivedAt: updated.arrivedAt! };
}

/**
 * Registra la entrega de un pedido con su evidencia y lo marca ENTREGADO.
 * Si el repartidor cobró en la puerta, el pago entra en la misma transacción:
 * o queda entregado y cobrado, o no queda nada. Si con esta cae la última
 * pendiente, la ruta se cierra sola.
 */
export async function registerDelivery(
  user: SessionUser,
  orderId: string,
  input: DeliveryProofInput,
) {
  const order = await getOrderInRoute(orderId);
  assertCanWorkRoute(user, order.route?.driverId);

  if (order.status !== OrderStatus.DESPACHADO) {
    throw new BusinessRuleError(
      "Solo se puede registrar la entrega de un pedido que ya salió a ruta.",
    );
  }

  const { payment, ...proof } = input;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.deliveryProof.upsert({
      where: { orderId },
      update: { ...proof, deliveredAt: now },
      create: { ...proof, orderId, deliveredAt: now },
    });

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.ENTREGADO,
        deliveredAt: now,
        // Entregar sin haber marcado la llegada deja la hora de la entrega.
        ...(order.arrivedAt ? {} : { arrivedAt: now }),
      },
    });

    if (payment) await recordPayment(tx, user, orderId, payment);

    await completeRouteIfDone(tx, order.routeId, now);

    return updated;
  });
}

/**
 * Visita en la que no se pudo entregar. Queda el intento con su motivo y el
 * pedido vuelve a preparación, fuera de la ruta, para reprogramarse: igual
 * que cuando se cancela una ruta, el inventario sigue reservado.
 */
export async function registerFailedDelivery(
  user: SessionUser,
  orderId: string,
  input: DeliveryFailureInput,
) {
  const order = await getOrderInRoute(orderId);
  assertCanWorkRoute(user, order.route?.driverId);

  if (order.status !== OrderStatus.DESPACHADO) {
    throw new BusinessRuleError(
      "Solo se puede reportar que no se entregó un pedido que ya salió a ruta.",
    );
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.deliveryAttempt.create({
      data: {
        orderId,
        routeId: order.routeId,
        userId: user.id,
        reason: input.reason,
        notes: input.notes,
        arrivedAt: order.arrivedAt,
      },
    });

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.EN_PREPARACION,
        routeId: null,
        routeSequence: null,
        arrivedAt: null,
      },
    });

    await completeRouteIfDone(tx, order.routeId, now);

    return updated;
  });
}

/**
 * Las rutas que le tocan al repartidor hoy, con sus paradas en orden: lo que
 * ve en su teléfono. Incluye una ruta que sigue en la calle de un día
 * anterior. ADMIN y BODEGA ven las de todos, para poder acompañar el reparto.
 */
export async function getDriverDay(user: SessionUser, fecha?: string) {
  const day = fecha ?? todayInBogota();
  const date = new Date(`${day}T00:00:00.000Z`);
  await materializeScheduledRoutes(todayInBogota());
  const ownOnly = user.role === UserRole.DESPACHO;

  const routes = await prisma.deliveryRoute.findMany({
    where: {
      ...(ownOnly ? { driverId: user.id } : {}),
      status: { not: RouteStatus.CANCELADA },
      OR: [{ date }, { status: RouteStatus.EN_RUTA }],
    },
    orderBy: [{ date: "asc" }, { name: "asc" }],
    include: {
      driver: { select: { id: true, name: true } },
      orders: {
        where: { status: { not: OrderStatus.CANCELADO } },
        orderBy: { routeSequence: "asc" },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          routeSequence: true,
          collectionNote: true,
          giftNote: true,
          arrivedAt: true,
          deliveredAt: true,
          client: { select: { id: true, businessName: true, tradeName: true, phone: true } },
          address: {
            select: {
              label: true,
              address: true,
              neighborhood: true,
              locality: true,
              deliveryNotes: true,
            },
          },
          proof: { select: { receivedBy: true, notes: true } },
          payments: { select: { amount: true } },
          _count: { select: { items: true } },
        },
      },
    },
  });

  return routes.map((route) => ({
    ...route,
    orders: route.orders.map(({ payments, total, ...order }) => {
      const paid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        ...order,
        total: Number(total),
        balance: Math.max(0, Math.round(Number(total) - paid)),
      };
    }),
  }));
}

// ─────────────────────────────────────────────────────────────
// Despacho del día
// ─────────────────────────────────────────────────────────────

/** Pedidos que cuentan para el reparto de un día (ni borradores ni cancelados). */
const DISPATCH_DAY_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMADO,
  OrderStatus.EN_PREPARACION,
  OrderStatus.DESPACHADO,
  OrderStatus.ENTREGADO,
];

/** Hoy en Bogotá como "AAAA-MM-DD"; el servidor corre en UTC. */
export function todayInBogota(now: Date = new Date()): string {
  const local = new TZDate(now, BUSINESS_TIME_ZONE);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

/**
 * Todo lo que hay que entregar un día, con la localidad y las observaciones
 * de cobro y obsequios. La entrega pedida es una fecha de calendario
 * (medianoche UTC), no un momento.
 */
export async function getDispatchDay(fecha?: string) {
  const day = fecha ?? todayInBogota();
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: DISPATCH_DAY_STATUSES },
      requestedDeliveryDate: { gte: start, lt: end },
    },
    orderBy: { orderNumber: "asc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      collectionNote: true,
      giftNote: true,
      notes: true,
      route: { select: { id: true, name: true } },
      client: { select: { businessName: true, tradeName: true, phone: true } },
      address: {
        select: {
          address: true,
          neighborhood: true,
          locality: true,
          deliveryNotes: true,
          zone: { select: { name: true } },
        },
      },
      items: {
        select: {
          productNameSnapshot: true,
          presentationSnapshot: true,
          quantity: true,
        },
      },
    },
  });

  return {
    day,
    orders: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      clientName: order.client.tradeName ?? order.client.businessName,
      phone: order.client.phone,
      // Sin localidad escrita, la zona amplia es mejor que nada.
      locality: order.address?.locality ?? order.address?.zone?.name ?? null,
      neighborhood: order.address?.neighborhood ?? null,
      address: order.address?.address ?? null,
      deliveryNotes: order.address?.deliveryNotes ?? null,
      total: Number(order.total),
      collectionNote: order.collectionNote,
      giftNote: order.giftNote,
      notes: order.notes,
      route: order.route,
      items: order.items.map((item) => ({
        name: item.productNameSnapshot,
        presentation: item.presentationSnapshot,
        quantity: Number(item.quantity),
      })),
    })),
  };
}

/**
 * Observaciones para el repartidor: qué cobrar y qué obsequio lleva el pedido.
 * Se pueden editar hasta que el pedido se entrega; un VENDEDOR solo en los suyos.
 */
export async function updateDispatchNotes(
  user: SessionUser,
  orderId: string,
  input: DispatchNotesInput,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, sellerId: true },
  });

  if (!order) throw new NotFoundError("El pedido");
  if (user.role === UserRole.VENDEDOR && order.sellerId !== user.id) {
    throw new ForbiddenError("Este pedido no es tuyo.");
  }
  if (order.status === OrderStatus.ENTREGADO || order.status === OrderStatus.CANCELADO) {
    throw new BusinessRuleError(
      "El pedido ya está cerrado: las observaciones de entrega no se modifican.",
    );
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      ...(input.collectionNote !== undefined ? { collectionNote: input.collectionNote } : {}),
      ...(input.giftNote !== undefined ? { giftNote: input.giftNote } : {}),
    },
    select: { id: true, collectionNote: true, giftNote: true },
  });
}
