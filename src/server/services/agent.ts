import { prisma } from "../db";
import { BusinessRuleError, NotFoundError, ValidationError } from "../errors";
import type { SessionUser } from "../guards";
import { buildPriceResolver } from "./pricing";
import type { Prisma } from "@/generated/prisma/client";
import type { OpportunityStage } from "@/generated/prisma/enums";
import { PRESENTATION_LABEL } from "@/lib/labels";
import { formatClientCode, formatCOP, formatOrderNumber } from "@/lib/format";
import { OPEN_STAGES } from "@/lib/pipeline-stages";
import {
  agentStageBlocker,
  describeInterest,
  mergeInterest,
  pickSeller,
  stageAfterVisit,
  valueInterest,
  withInterestBlock,
  type PricedVariant,
} from "@/lib/agent-rules";
import type {
  AgentActivityInput,
  AgentStageInput,
  EscalateInput,
  LeadCreateInput,
  LeadUpdateInput,
  OpportunityUpsertInput,
  VisitInput,
} from "../validators/agent";

/**
 * Trabajo comercial del agente IA de WhatsApp (`/api/agente/*`).
 *
 * El agente no tiene cartera: ve todos los clientes para poder encontrar a
 * quien ya existe. A cambio, sus límites están aquí y no en un rol:
 * - Nunca fija precios: manda kilos al mes y el CRM los valora.
 * - Nunca cierra: solo mueve entre CONTACTADO, MUESTRA_ENVIADA y NEGOCIACION.
 * - Nunca activa clientes: un lead nace y sigue como PROSPECTO hasta que un
 *   vendedor gana la oportunidad.
 *
 * Lo que hace el agente queda en la bitácora a su nombre. Lo que le toca hacer
 * a una persona (una visita, atender un escalamiento) se agenda a nombre del
 * vendedor del cliente, porque la agenda de cada vendedor son sus actividades
 * pendientes.
 */

type Tx = Prisma.TransactionClient;

const OPEN_STAGE_FILTER = { in: OPEN_STAGES };

// ── Utilidades ───────────────────────────────────────────────

/**
 * Serializa dentro de la transacción las operaciones sobre la misma llave
 * (un teléfono, la rotación). Es un candado de Postgres que se suelta solo al
 * terminar la transacción, así que funciona detrás de PgBouncer.
 */
async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Persona que atiende lo que el agente no puede hacer: el vendedor del
 * cliente si está activo; si no, el primer ADMIN activo.
 */
async function responsibleUser(
  tx: Tx,
  ownerId: string | null,
): Promise<{ id: string; name: string; isOwner: boolean }> {
  if (ownerId) {
    const owner = await tx.user.findFirst({
      where: { id: ownerId, active: true },
      select: { id: true, name: true },
    });
    if (owner) return { ...owner, isOwner: true };
  }

  const admin = await tx.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!admin) {
    throw new BusinessRuleError(
      "No hay vendedor ni administrador activo para atender este cliente.",
    );
  }
  return { ...admin, isOwner: false };
}

/** Elige vendedor por rotación: el activo con menos prospectos. */
async function rotateSeller(tx: Tx): Promise<string | null> {
  await lock(tx, "agente:rotacion-vendedores");

  const sellers = await tx.user.findMany({
    where: { role: "VENDEDOR", active: true },
    select: {
      id: true,
      _count: { select: { ownedClients: { where: { status: "PROSPECTO" } } } },
      ownedClients: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  return pickSeller(
    sellers.map((seller) => ({
      id: seller.id,
      prospectCount: seller._count.ownedClients,
      lastAssignedAt: seller.ownedClients[0]?.createdAt ?? null,
    })),
  );
}

/** Fecha y hora en Bogotá, sin depender de la zona del servidor. */
function formatBogota(date: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

function splitName(fullName: string): { firstName: string; lastName?: string } {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  return { firstName, lastName: lastName || undefined };
}

async function getClientOrThrow(tx: Tx, clientId: string) {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      businessName: true,
      tradeName: true,
      ownerId: true,
      priceListId: true,
      status: true,
    },
  });
  if (!client) throw new NotFoundError("El cliente");
  return client;
}

function clientDisplayName(client: { businessName: string; tradeName: string | null }) {
  return client.tradeName ?? client.businessName;
}

// ── Lectura: lo que el agente sabe de un número ──────────────

const leadClientSelect = {
  id: true,
  sequence: true,
  businessName: true,
  tradeName: true,
  type: true,
  status: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, active: true } },
  activities: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  },
} as const;

/**
 * Ficha resumida para el agente: cliente, contacto, vendedor, oportunidad
 * abierta, último pedido y sede principal.
 */
async function leadView(clientId: string, contactId: string | null) {
  const [client, contact, opportunity, lastOrder, address] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: leadClientSelect,
    }),
    contactId
      ? prisma.contact.findUnique({
          where: { id: contactId },
          select: { id: true, firstName: true, lastName: true, jobTitle: true },
        })
      : null,
    prisma.opportunity.findFirst({
      where: { clientId, stage: OPEN_STAGE_FILTER },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, stage: true, estimatedValue: true },
    }),
    prisma.order.findFirst({
      where: { clientId },
      orderBy: { orderDate: "desc" },
      select: { orderNumber: true, status: true, total: true, orderDate: true },
    }),
    prisma.clientAddress.findFirst({
      where: { clientId, active: true },
      orderBy: { isPrimary: "desc" },
      select: { address: true, neighborhood: true, city: true },
    }),
  ]);

  return {
    cliente: {
      id: client.id,
      codigo: formatClientCode(client.sequence),
      razonSocial: client.businessName,
      nombreComercial: client.tradeName,
      tipo: client.type,
      estado: client.status,
    },
    contacto: contact
      ? {
          id: contact.id,
          nombre: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
          cargo: contact.jobTitle,
        }
      : null,
    vendedor:
      client.owner && client.owner.active
        ? { id: client.owner.id, nombre: client.owner.name }
        : null,
    oportunidadAbierta: opportunity
      ? {
          id: opportunity.id,
          titulo: opportunity.title,
          etapa: opportunity.stage,
          valorEstimado: Number(opportunity.estimatedValue),
        }
      : null,
    ultimoPedido: lastOrder
      ? {
          numero: formatOrderNumber(lastOrder.orderNumber),
          estado: lastOrder.status,
          total: Number(lastOrder.total),
          fecha: lastOrder.orderDate,
        }
      : null,
    sedePrincipal: address
      ? { direccion: address.address, barrio: address.neighborhood, ciudad: address.city }
      : null,
  };
}

export type AgentLead = Awaited<ReturnType<typeof leadView>>;

/**
 * Busca por número de WhatsApp. Si el número está en varios clientes, gana el
 * de actividad más reciente: es con quien se viene hablando.
 */
export async function findLeadByPhone(phone: string): Promise<AgentLead | null> {
  const contacts = await prisma.contact.findMany({
    where: { whatsappE164: phone, active: true },
    select: { id: true, client: { select: leadClientSelect } },
  });
  if (contacts.length === 0) return null;

  const lastTouch = (c: (typeof contacts)[number]) =>
    Math.max(
      c.client.updatedAt.getTime(),
      c.client.activities[0]?.createdAt.getTime() ?? 0,
    );
  const best = contacts.reduce((a, b) => (lastTouch(b) > lastTouch(a) ? b : a));

  return leadView(best.client.id, best.id);
}

// ── Leads ────────────────────────────────────────────────────

/**
 * Crea el lead (cliente PROSPECTO + contacto) y lo vincula a la conversación.
 * Es idempotente por teléfono: si ya existe, lo devuelve sin crear nada. El
 * candado por número evita duplicados cuando n8n reintenta en paralelo.
 */
export async function createLead(
  agent: SessionUser,
  input: LeadCreateInput,
): Promise<{ created: boolean; lead: AgentLead }> {
  const existing = await findLeadByPhone(input.telefono);
  if (existing) return { created: false, lead: existing };

  const result = await prisma.$transaction(async (tx) => {
    await lock(tx, `agente:telefono:${input.telefono}`);

    // Otro request pudo crearlo mientras esperábamos el candado.
    const raced = await tx.contact.findFirst({
      where: { whatsappE164: input.telefono, active: true },
      select: { id: true, clientId: true },
    });
    if (raced) return { created: false, clientId: raced.clientId, contactId: raced.id };

    const ownerId = await rotateSeller(tx);
    const defaultList = await tx.priceList.findFirst({
      where: { isDefault: true, active: true },
      select: { id: true },
    });

    const name = splitName(input.nombreContacto);
    const businessName =
      input.negocio ?? `${input.nombreContacto} (WhatsApp ${input.telefono})`;

    const client = await tx.client.create({
      data: {
        businessName,
        tradeName: input.negocio,
        type: input.tipo ?? "OTRO",
        status: "PROSPECTO",
        phone: input.telefono,
        ownerId,
        priceListId: defaultList?.id,
        notes: "Lead creado por el agente IA de WhatsApp.",
      },
      select: { id: true },
    });

    const contact = await tx.contact.create({
      data: {
        clientId: client.id,
        ...name,
        whatsapp: input.telefono,
        whatsappE164: input.telefono,
        isPrimary: true,
      },
      select: { id: true },
    });

    await tx.whatsappConversation.upsert({
      where: { phone: input.telefono },
      create: { phone: input.telefono, clientId: client.id, contactId: contact.id },
      update: { clientId: client.id, contactId: contact.id },
    });

    await tx.activity.create({
      data: {
        type: "WHATSAPP",
        subject: "Nuevo lead por WhatsApp",
        notes: ownerId
          ? `Lead creado por el agente IA desde el ${input.telefono}.`
          : `Lead creado por el agente IA desde el ${input.telefono}. No hay vendedores activos: quedó sin asignar.`,
        userId: agent.id,
        clientId: client.id,
        contactId: contact.id,
        completedAt: new Date(),
      },
    });

    // Sin vendedores, alguien tiene que enterarse: tarea para el ADMIN.
    if (!ownerId) {
      const admin = await responsibleUser(tx, null);
      await tx.activity.create({
        data: {
          type: "NOTA",
          subject: "Asignar vendedor a lead de WhatsApp",
          notes: `No había vendedores activos cuando entró el lead ${businessName} (${input.telefono}).`,
          userId: admin.id,
          clientId: client.id,
          dueAt: new Date(),
        },
      });
    }

    return { created: true, clientId: client.id, contactId: contact.id };
  });

  return {
    created: result.created,
    lead: await leadView(result.clientId, result.contactId),
  };
}

/**
 * Completa los datos del lead a medida que el prospecto los cuenta. Nunca
 * cambia estado, vendedor ni NIT: eso es trabajo de un vendedor.
 */
export async function updateLead(
  agent: SessionUser,
  clientId: string,
  input: LeadUpdateInput,
): Promise<AgentLead> {
  const contactId = await prisma.$transaction(async (tx) => {
    const client = await getClientOrThrow(tx, clientId);

    await tx.client.update({
      where: { id: clientId },
      data: {
        businessName: input.razonSocial,
        tradeName: input.nombreComercial,
        type: input.tipo,
        email: input.correo,
      },
    });

    const contact = await tx.contact.findFirst({
      where: { clientId, active: true },
      orderBy: { isPrimary: "desc" },
      select: { id: true },
    });

    if (contact && (input.nombreContacto || input.cargoContacto)) {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          ...(input.nombreContacto ? splitName(input.nombreContacto) : {}),
          jobTitle: input.cargoContacto,
        },
      });
    }

    if (input.sede) {
      await upsertPrimaryAddress(tx, clientId, input.sede);
    }

    await tx.activity.create({
      data: {
        type: "NOTA",
        subject: "Datos actualizados por el agente IA",
        notes: describeLeadChanges(input),
        userId: agent.id,
        clientId: client.id,
        completedAt: new Date(),
      },
    });

    return contact?.id ?? null;
  });

  return leadView(clientId, contactId);
}

/**
 * Registra la dirección que dio el prospecto. Si el cliente no tiene sede,
 * se crea como principal; si ya tiene una, se actualiza la principal: un
 * prospecto tiene un solo local y lo está corrigiendo.
 */
async function upsertPrimaryAddress(
  tx: Tx,
  clientId: string,
  sede: { direccion: string; barrio?: string; ciudad: string; indicaciones?: string },
) {
  const current = await tx.clientAddress.findFirst({
    where: { clientId, active: true },
    orderBy: { isPrimary: "desc" },
    select: { id: true },
  });

  const data = {
    address: sede.direccion,
    neighborhood: sede.barrio,
    city: sede.ciudad,
    deliveryNotes: sede.indicaciones,
  };

  if (current) {
    await tx.clientAddress.update({ where: { id: current.id }, data });
  } else {
    await tx.clientAddress.create({
      data: { ...data, clientId, label: "Principal", isPrimary: true },
    });
  }
}

function describeLeadChanges(input: LeadUpdateInput): string {
  const parts: string[] = [];
  if (input.razonSocial) parts.push(`Razón social: ${input.razonSocial}`);
  if (input.nombreComercial) parts.push(`Nombre comercial: ${input.nombreComercial}`);
  if (input.tipo) parts.push(`Tipo: ${input.tipo}`);
  if (input.correo) parts.push(`Correo: ${input.correo}`);
  if (input.nombreContacto) parts.push(`Contacto: ${input.nombreContacto}`);
  if (input.cargoContacto) parts.push(`Cargo: ${input.cargoContacto}`);
  if (input.sede) parts.push(`Dirección: ${input.sede.direccion}, ${input.sede.ciudad}`);
  return parts.join("\n");
}

// ── Oportunidades ────────────────────────────────────────────

/**
 * Registra el interés del prospecto. Hay una sola oportunidad abierta por
 * cliente: si ya existe se revalora, si no se crea en CONTACTADO. El dueño es
 * el vendedor del cliente y el valor lo calcula el CRM con la lista de
 * precios del cliente.
 */
export async function upsertOpportunity(
  agent: SessionUser,
  input: OpportunityUpsertInput,
) {
  const client = await getClientOrThrow(prisma, input.clientId);
  const interest = mergeInterest(
    input.interes.map((line) => ({ sku: line.sku, kilosPerMonth: line.kilosMes })),
  );

  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: interest.map((line) => line.sku) }, active: true },
    select: {
      id: true,
      sku: true,
      presentation: true,
      netWeightG: true,
      product: { select: { name: true, active: true } },
    },
  });

  const bySku = new Map<string, PricedVariant>(
    variants
      .filter((variant) => variant.product.active)
      .map((variant) => [
        variant.sku,
        {
          id: variant.id,
          sku: variant.sku,
          netWeightG: variant.netWeightG,
          label: `${variant.product.name} (${PRESENTATION_LABEL[variant.presentation].toLowerCase()})`,
        },
      ]),
  );

  const unknown = interest.filter((line) => !bySku.has(line.sku)).map((l) => l.sku);
  if (unknown.length > 0) {
    throw new ValidationError(
      `SKU desconocido o inactivo: ${unknown.join(", ")}.`,
      { skuDesconocidos: unknown },
    );
  }

  const resolver = await buildPriceResolver(
    [...bySku.values()].map((variant) => variant.id),
    client.priceListId,
  );
  const valuation = valueInterest(interest, bySku, (id, units) =>
    resolver.unitPriceFor(id, units),
  );
  const breakdown = describeInterest(valuation.lines, formatCOP);

  const opportunity = await prisma.$transaction(async (tx) => {
    await lock(tx, `agente:oportunidad:${client.id}`);

    const open = await tx.opportunity.findFirst({
      where: { clientId: client.id, stage: OPEN_STAGE_FILTER },
      orderBy: { updatedAt: "desc" },
      select: { id: true, notes: true },
    });

    const saved = open
      ? await tx.opportunity.update({
          where: { id: open.id },
          data: {
            estimatedValue: valuation.total,
            notes: withInterestBlock(open.notes, breakdown),
          },
        })
      : await tx.opportunity.create({
          data: {
            clientId: client.id,
            title: `WhatsApp · ${clientDisplayName(client)}`,
            stage: "CONTACTADO",
            estimatedValue: valuation.total,
            ownerId: client.ownerId,
            notes: withInterestBlock(input.notas ?? null, breakdown),
          },
        });

    await tx.activity.create({
      data: {
        type: "WHATSAPP",
        subject: open
          ? `Interés actualizado: ${formatCOP(valuation.total)} al mes`
          : `Oportunidad registrada: ${formatCOP(valuation.total)} al mes`,
        notes: [
          breakdown,
          `Lista de precios: ${resolver.priceListName}`,
          input.notas,
        ]
          .filter(Boolean)
          .join("\n\n"),
        userId: agent.id,
        clientId: client.id,
        opportunityId: saved.id,
        completedAt: new Date(),
      },
    });

    return { saved, created: !open };
  });

  return {
    creada: opportunity.created,
    oportunidad: {
      id: opportunity.saved.id,
      titulo: opportunity.saved.title,
      etapa: opportunity.saved.stage,
      valorEstimado: Number(opportunity.saved.estimatedValue),
    },
    detalle: valuation.lines.map((line) => ({
      sku: line.sku,
      producto: line.label,
      kilosMes: line.kilosPerMonth,
      unidades: line.units,
      precioUnitario: line.unitPrice,
      subtotal: line.subtotal,
    })),
    listaPrecios: resolver.priceListName,
    sinPrecio: valuation.withoutPrice,
  };
}

/** Mueve la oportunidad dentro de las etapas que le corresponden al agente. */
export async function moveOpportunityStage(
  agent: SessionUser,
  opportunityId: string,
  input: AgentStageInput,
) {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, stage: true, clientId: true },
  });
  if (!opportunity) throw new NotFoundError("La oportunidad");

  const blocker = agentStageBlocker(opportunity.stage, input.etapa);
  if (blocker) throw new BusinessRuleError(blocker);

  if (opportunity.stage === input.etapa) {
    return { id: opportunity.id, etapa: opportunity.stage, cambio: false };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.opportunity.update({
      where: { id: opportunityId },
      data: { stage: input.etapa },
      select: { id: true, stage: true },
    });
    await tx.activity.create({
      data: {
        type: "NOTA",
        subject: `Etapa: ${opportunity.stage} → ${input.etapa}`,
        notes: "Movida por el agente IA de WhatsApp.",
        userId: agent.id,
        clientId: opportunity.clientId,
        opportunityId,
        completedAt: new Date(),
      },
    });
    return saved;
  });

  return { id: updated.id, etapa: updated.stage, cambio: true };
}

// ── Bitácora ─────────────────────────────────────────────────

/** Deja el resumen de una conversación en la ficha del cliente. */
export async function logConversation(
  agent: SessionUser,
  input: AgentActivityInput,
) {
  await getClientOrThrow(prisma, input.clientId);

  const open = await prisma.opportunity.findFirst({
    where: { clientId: input.clientId, stage: OPEN_STAGE_FILTER },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const activity = await prisma.activity.create({
    data: {
      type: "WHATSAPP",
      subject: input.asunto,
      notes: input.notas,
      userId: agent.id,
      clientId: input.clientId,
      opportunityId: open?.id,
      completedAt: new Date(),
    },
    select: { id: true, subject: true, createdAt: true },
  });

  return { id: activity.id, asunto: activity.subject, fecha: activity.createdAt };
}

// ── Visitas y escalamiento ───────────────────────────────────

/**
 * Pone la conversación en manos de una persona: el bot deja de responder
 * hasta que el vendedor la libere.
 */
async function handOver(
  tx: Tx,
  phone: string,
  assignedUserId: string,
  summary: string,
  link?: { clientId: string; contactId?: string | null },
) {
  return tx.whatsappConversation.upsert({
    where: { phone },
    create: {
      phone,
      status: "HUMANO",
      assignedUserId,
      summary,
      clientId: link?.clientId,
      contactId: link?.contactId ?? undefined,
    },
    update: { status: "HUMANO", assignedUserId, summary },
    select: { id: true, status: true },
  });
}

/** Teléfono del contacto principal del cliente, para ubicar su conversación. */
async function clientPhone(tx: Tx, clientId: string) {
  const conversation = await tx.whatsappConversation.findFirst({
    where: { clientId },
    orderBy: { lastMessageAt: "desc" },
    select: { phone: true, contactId: true },
  });
  if (conversation) return conversation;

  const contact = await tx.contact.findFirst({
    where: { clientId, active: true, whatsappE164: { not: null } },
    orderBy: { isPrimary: "desc" },
    select: { id: true, whatsappE164: true },
  });
  return contact?.whatsappE164
    ? { phone: contact.whatsappE164, contactId: contact.id }
    : null;
}

/**
 * El lead aceptó una visita presencial (el cierre principal según el
 * entrenamiento de Dicampo). Queda en la agenda del vendedor como VISITA
 * pendiente en la fecha acordada, la oportunidad avanza a CONTACTADO si
 * seguía en PROSPECTO y la conversación pasa a HUMANO.
 */
export async function scheduleVisit(agent: SessionUser, input: VisitInput) {
  const when = new Date(input.fecha);
  if (when.getTime() < Date.now() - 60 * 60 * 1000) {
    throw new ValidationError("La fecha de la visita ya pasó.");
  }

  return prisma.$transaction(async (tx) => {
    const client = await getClientOrThrow(tx, input.clientId);
    await lock(tx, `agente:oportunidad:${client.id}`);

    const person = await responsibleUser(tx, client.ownerId);
    const name = clientDisplayName(client);

    await upsertPrimaryAddress(tx, client.id, {
      direccion: input.direccion,
      barrio: input.barrio,
      ciudad: input.ciudad,
    });

    const open = await tx.opportunity.findFirst({
      where: { clientId: client.id, stage: OPEN_STAGE_FILTER },
      orderBy: { updatedAt: "desc" },
      select: { id: true, stage: true },
    });
    const nextStage: OpportunityStage = open ? stageAfterVisit(open.stage) : "CONTACTADO";
    const opportunity = open
      ? open.stage === nextStage
        ? open
        : await tx.opportunity.update({
            where: { id: open.id },
            data: { stage: nextStage },
            select: { id: true, stage: true },
          })
      : await tx.opportunity.create({
          data: {
            clientId: client.id,
            title: `WhatsApp · ${name}`,
            stage: nextStage,
            ownerId: client.ownerId,
          },
          select: { id: true, stage: true },
        });

    const where = [input.direccion, input.barrio, input.ciudad].filter(Boolean).join(", ");
    const visit = await tx.activity.create({
      data: {
        type: "VISITA",
        subject: `Visita comercial · ${name}`,
        notes: [
          `Agendada por el agente IA de WhatsApp para el ${formatBogota(when)}`,
          `Dirección: ${where}`,
          person.isOwner ? null : "El cliente no tiene vendedor activo: revisa la asignación.",
          input.notas,
        ]
          .filter(Boolean)
          .join("\n"),
        userId: person.id,
        clientId: client.id,
        opportunityId: opportunity.id,
        dueAt: when,
      },
      select: { id: true, dueAt: true },
    });

    const phone = await clientPhone(tx, client.id);
    const conversation = phone
      ? await handOver(
          tx,
          phone.phone,
          person.id,
          `Visita agendada para el ${formatBogota(when)} en ${where}.`,
          { clientId: client.id, contactId: phone.contactId },
        )
      : null;

    return {
      visita: { id: visit.id, fecha: visit.dueAt, direccion: where },
      asignadaA: { id: person.id, nombre: person.name, esVendedor: person.isOwner },
      oportunidad: { id: opportunity.id, etapa: opportunity.stage },
      conversacion: conversation
        ? { id: conversation.id, estado: conversation.status }
        : null,
    };
  });
}

/**
 * Pasa la conversación a una persona: estado HUMANO, asignada al vendedor
 * del cliente y con una tarea pendiente para ya en su agenda. Si ya estaba
 * en manos de una persona, solo actualiza el resumen.
 */
export async function escalate(input: EscalateInput) {
  const lead = await findLeadByPhone(input.telefono);

  return prisma.$transaction(async (tx) => {
    await lock(tx, `agente:telefono:${input.telefono}`);

    const current = await tx.whatsappConversation.findUnique({
      where: { phone: input.telefono },
      select: { id: true, status: true, assignedUserId: true },
    });

    // Si ya la atiende alguien, se respeta; si no, va al vendedor del cliente.
    const ownerId = lead?.vendedor?.id ?? null;
    const assigned =
      current?.status === "HUMANO" && current.assignedUserId
        ? await responsibleUser(tx, current.assignedUserId)
        : await responsibleUser(tx, ownerId);
    const person = { ...assigned, isOwner: ownerId !== null && assigned.id === ownerId };

    const conversation = await handOver(
      tx,
      input.telefono,
      person.id,
      input.resumen,
      lead ? { clientId: lead.cliente.id, contactId: lead.contacto?.id } : undefined,
    );

    const alreadyHuman = current?.status === "HUMANO";
    let taskId: string | null = null;

    if (!alreadyHuman) {
      const task = await tx.activity.create({
        data: {
          type: "WHATSAPP",
          subject: `Atender WhatsApp: ${input.motivo}`,
          notes: [
            `Escalado por el agente IA. Número: +${input.telefono}`,
            lead ? null : "Aún no está registrado como cliente.",
            "",
            input.resumen,
          ]
            .filter((line) => line !== null)
            .join("\n"),
          userId: person.id,
          clientId: lead?.cliente.id,
          contactId: lead?.contacto?.id,
          opportunityId: lead?.oportunidadAbierta?.id,
          dueAt: new Date(),
        },
        select: { id: true },
      });
      taskId = task.id;
    }

    return {
      conversacion: { id: conversation.id, estado: conversation.status },
      asignadaA: { id: person.id, nombre: person.name, esVendedor: person.isOwner },
      tareaId: taskId,
      yaEstabaEscalada: alreadyHuman,
    };
  });
}
