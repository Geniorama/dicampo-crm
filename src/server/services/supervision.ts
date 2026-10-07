import { prisma } from "../db";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "../errors";
import type { SessionUser } from "../guards";
import { lockKey } from "../locks";
import { sendViaN8n } from "../n8n";
import { createSignedDownload } from "../storage";
import type { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { serviceWindow } from "@/lib/conversation-rules";
import { OPEN_STAGES } from "@/lib/pipeline-stages";
import type {
  AdvisorReplyInput,
  ConversationListQuery,
} from "../validators/conversations";

/**
 * Supervisión de las conversaciones de WhatsApp desde el CRM (con sesión).
 *
 * Quién ve qué:
 * - ADMIN ve todas.
 * - VENDEDOR ve las de los clientes de su cartera y las que tiene asignadas
 *   (un escalamiento puede llegarle antes de que el número sea cliente).
 *
 * Tomar una conversación la pasa a HUMANO: el agente deja de responder hasta
 * que el asesor la libere. Lo que escribe el asesor sale por n8n.
 */

/** Cuántos mensajes se cargan en el chat: los más recientes. */
const CHAT_PAGE = 200;

/** Las URLs firmadas de la multimedia duran una hora en pantalla. */
const MEDIA_URL_TTL_SECONDS = 60 * 60;

function conversationScope(user: SessionUser): Prisma.WhatsappConversationWhereInput {
  if (user.role === UserRole.ADMIN) return {};
  return {
    OR: [{ client: { ownerId: user.id } }, { assignedUserId: user.id }],
  };
}

function isAdmin(user: SessionUser) {
  return user.role === UserRole.ADMIN;
}

/** Fin del día local: un filtro "hasta el 7" incluye todo el 7. */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// ── Bandeja ──────────────────────────────────────────────────

export async function listConversations(
  user: SessionUser,
  query: ConversationListQuery,
) {
  const { search, status, assignedUserId, stage, from, to, page, pageSize } = query;
  const digits = search?.replace(/\D/g, "") ?? "";

  const where: Prisma.WhatsappConversationWhereInput = {
    AND: [
      conversationScope(user),
      status ? { status } : {},
      assignedUserId ? { assignedUserId } : {},
      stage
        ? {
            client: {
              opportunities: {
                some: OPEN_STAGES.includes(stage)
                  ? { stage }
                  : { stage, closedAt: { not: null } },
              },
            },
          }
        : {},
      from || to
        ? {
            lastMessageAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: endOfDay(to) } : {}),
            },
          }
        : {},
      search
        ? {
            OR: [
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
              { client: { businessName: { contains: search, mode: "insensitive" as const } } },
              { client: { tradeName: { contains: search, mode: "insensitive" as const } } },
              { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.whatsappConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        phone: true,
        status: true,
        lastMessageAt: true,
        lastInboundAt: true,
        disqualifiedReason: true,
        optOutAt: true,
        assignedUser: { select: { id: true, name: true } },
        contact: { select: { firstName: true, lastName: true } },
        client: {
          select: {
            id: true,
            businessName: true,
            tradeName: true,
            status: true,
            owner: { select: { id: true, name: true } },
            opportunities: {
              where: { stage: { in: OPEN_STAGES } },
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: { id: true, stage: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, type: true, author: true, createdAt: true },
        },
      },
    }),
    prisma.whatsappConversation.count({ where }),
  ]);

  return {
    items: items.map(({ messages, client, ...conversation }) => ({
      ...conversation,
      client: client
        ? { ...client, openOpportunity: client.opportunities[0] ?? null }
        : null,
      lastMessage: messages[0] ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type ConversationListItem = Awaited<
  ReturnType<typeof listConversations>
>["items"][number];

/** Personas a las que se puede filtrar en la bandeja. */
export async function listAdvisors(user: SessionUser) {
  if (!isAdmin(user)) return [{ id: user.id, name: user.name }];
  return prisma.user.findMany({
    where: { role: { in: [UserRole.VENDEDOR, UserRole.ADMIN] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

// ── Detalle ──────────────────────────────────────────────────

async function findInScope(user: SessionUser, id: string) {
  const conversation = await prisma.whatsappConversation.findFirst({
    where: { AND: [{ id }, conversationScope(user)] },
    select: { id: true, phone: true, status: true, assignedUserId: true, clientId: true, lastInboundAt: true },
  });
  if (!conversation) throw new NotFoundError("La conversación");
  return conversation;
}

export async function getConversation(user: SessionUser, id: string) {
  await findInScope(user, id);

  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id },
    include: {
      assignedUser: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      client: {
        select: {
          id: true,
          sequence: true,
          businessName: true,
          tradeName: true,
          status: true,
          type: true,
          owner: { select: { id: true, name: true } },
          opportunities: {
            where: { stage: { in: OPEN_STAGES } },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { id: true, title: true, stage: true, estimatedValue: true },
          },
        },
      },
      _count: { select: { messages: true } },
    },
  });

  const recent = await prisma.whatsappMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE,
    include: { authorUser: { select: { name: true } } },
  });
  const messages = recent.reverse();

  // Firma solo lo que se va a mostrar; si Storage falla, el chat igual carga
  // y el archivo aparece como no disponible.
  const mediaUrls = new Map<string, string | null>();
  await Promise.all(
    messages
      .filter((message) => message.mediaPath)
      .map(async (message) => {
        const url = await createSignedDownload(message.mediaPath!, MEDIA_URL_TTL_SECONDS).catch(
          () => null,
        );
        mediaUrls.set(message.id, url);
      }),
  );

  return {
    ...conversation,
    window: serviceWindow(conversation.lastInboundAt),
    totalMessages: conversation._count.messages,
    messages: messages.map((message) => ({
      ...message,
      mediaUrl: message.mediaPath ? (mediaUrls.get(message.id) ?? null) : null,
    })),
  };
}

export type ConversationDetail = Awaited<ReturnType<typeof getConversation>>;

/**
 * Huella ligera para refrescar la pantalla solo cuando algo cambió: volver a
 * renderizar el chat re-firma los archivos y cortaría un audio a medias.
 */
export async function getConversationVersion(user: SessionUser, id: string) {
  await findInScope(user, id);
  const conversation = await prisma.whatsappConversation.findUniqueOrThrow({
    where: { id },
    select: { lastMessageAt: true, status: true, assignedUserId: true, updatedAt: true },
  });
  return {
    version: [
      conversation.lastMessageAt?.getTime() ?? 0,
      conversation.status,
      conversation.assignedUserId ?? "",
      conversation.updatedAt.getTime(),
    ].join(":"),
  };
}

// ── Tomar, liberar y responder ───────────────────────────────

/**
 * El asesor toma la conversación: pasa a HUMANO y queda asignada a él. Un
 * vendedor no puede quitarle una conversación a otro; un ADMIN sí.
 */
export async function takeConversation(user: SessionUser, id: string) {
  const current = await findInScope(user, id);

  if (
    current.status === "HUMANO" &&
    current.assignedUserId &&
    current.assignedUserId !== user.id &&
    !isAdmin(user)
  ) {
    throw new ForbiddenError("Otra persona ya está atendiendo esta conversación.");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.whatsappConversation.update({
      where: { id },
      data: { status: "HUMANO", assignedUserId: user.id },
      select: { id: true, status: true, assignedUserId: true },
    });

    if (current.clientId && current.status !== "HUMANO") {
      await tx.activity.create({
        data: {
          type: "WHATSAPP",
          subject: "Tomó la conversación de WhatsApp",
          notes: "El agente IA deja de responder hasta que se libere.",
          userId: user.id,
          clientId: current.clientId,
          completedAt: new Date(),
        },
      });
    }
    return updated;
  });
}

/** Devuelve la conversación al agente IA. */
export async function releaseConversation(user: SessionUser, id: string) {
  const current = await findInScope(user, id);

  if (current.status !== "HUMANO") {
    throw new BusinessRuleError("La conversación no está en manos de un asesor.");
  }
  if (current.assignedUserId !== user.id && !isAdmin(user)) {
    throw new ForbiddenError("Solo quien la atiende o un administrador puede liberarla.");
  }

  return prisma.whatsappConversation.update({
    where: { id },
    data: { status: "BOT", assignedUserId: null },
    select: { id: true, status: true, assignedUserId: true },
  });
}

/**
 * El asesor responde. Exige haber tomado la conversación (si no, el agente
 * podría contestar a la vez) y la ventana de 24 h abierta: fuera de ella Meta
 * solo acepta plantillas aprobadas, que salen desde n8n.
 */
export async function sendAdvisorMessage(
  user: SessionUser,
  id: string,
  input: AdvisorReplyInput,
) {
  const current = await findInScope(user, id);

  if (current.status !== "HUMANO" || current.assignedUserId !== user.id) {
    throw new BusinessRuleError("Toma la conversación antes de responder.");
  }
  if (!serviceWindow(current.lastInboundAt).open) {
    throw new BusinessRuleError(
      "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo permite plantillas aprobadas.",
    );
  }

  const { waMessageId } = await sendViaN8n({
    telefono: current.phone,
    texto: input.texto,
    conversacionId: current.id,
    asesor: { id: user.id, nombre: user.name },
  });

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `agente:telefono:${current.phone}`);

    // Si n8n ya lo registró por la API del agente, no se duplica. Solo cuenta
    // si es de esta misma conversación: un id ajeno nunca debe pisar otro
    // mensaje (si llegara a pasar, el índice único lo rechaza).
    const existing = waMessageId
      ? await tx.whatsappMessage.findFirst({
          where: { waMessageId, conversationId: current.id },
          select: { id: true },
        })
      : null;

    const message = existing
      ? await tx.whatsappMessage.update({
          where: { id: existing.id },
          data: { author: "ASESOR", authorUserId: user.id },
          select: { id: true, createdAt: true },
        })
      : await tx.whatsappMessage.create({
          data: {
            conversationId: current.id,
            waMessageId,
            direction: "SALIENTE",
            author: "ASESOR",
            authorUserId: user.id,
            type: "TEXTO",
            body: input.texto,
            deliveryStatus: "sent",
            createdAt: now,
          },
          select: { id: true, createdAt: true },
        });

    await tx.whatsappConversation.update({
      where: { id: current.id },
      data: { lastMessageAt: now },
    });

    return { id: message.id, waMessageId, fecha: message.createdAt };
  });
}
