import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { NotFoundError, ValidationError } from "../errors";
import type { SessionUser } from "../guards";
import { lockKey } from "../locks";
import { createSignedUpload } from "../storage";
import { findLeadByPhone } from "./agent";
import { Prisma } from "@/generated/prisma/client";
import type { MessageAuthor } from "@/generated/prisma/enums";
import {
  MAX_FOLLOW_UPS,
  MEDIA_LIMITS,
  detectPolicyKeyword,
  followUpAfterAgentMessage,
  followUpAfterFollowUpSent,
  followUpAfterInbound,
  isMediaPathOf,
  mediaPath,
  nextDeliveryStatus,
  serviceWindow,
  type FollowUpState,
  type PolicyKeyword,
} from "@/lib/conversation-rules";
import type {
  ConsentInput,
  DeliveryInput,
  DisqualifyInput,
  MediaUploadInput,
  MessageInput,
} from "../validators/conversations";

/**
 * Conversaciones de WhatsApp vistas desde el agente (`/api/agente/...`).
 *
 * Un número es una conversación. n8n registra aquí cada mensaje, entrante o
 * saliente; el CRM lleva el estado que el flujo necesita para decidir:
 * quién responde (BOT o HUMANO), qué autorizó la persona, si la ventana de 24
 * horas de Meta está abierta y cuándo toca el siguiente seguimiento.
 */

type Tx = Prisma.TransactionClient;

/** Un mensaje con fecha "del futuro" (reloj de n8n adelantado) se recorta. */
function messageTime(fecha: string | undefined): Date {
  const now = new Date();
  if (!fecha) return now;
  const at = new Date(fecha);
  return at.getTime() > now.getTime() + 5 * 60 * 1000 ? now : at;
}

type ConversationLink = { clientId: string; contactId: string | null } | null;

/**
 * Cliente y contacto dueños del número, si ya está registrado. Se resuelve
 * ANTES de abrir la transacción: consultar con el cliente global dentro de
 * una transacción pediría una segunda conexión mientras la primera espera.
 */
async function resolveLink(phone: string): Promise<ConversationLink> {
  const lead = await findLeadByPhone(phone);
  return lead ? { clientId: lead.cliente.id, contactId: lead.contacto?.id ?? null } : null;
}

/**
 * Trae la conversación del número o la crea, vinculada al cliente si el
 * número ya es de un contacto registrado. No crea clientes: eso solo pasa
 * con `POST /api/agente/leads`.
 */
async function ensureConversation(tx: Tx, phone: string, link: ConversationLink) {
  const existing = await tx.whatsappConversation.findUnique({ where: { phone } });
  if (existing && (existing.clientId || !link)) return existing;
  if (existing) {
    return tx.whatsappConversation.update({ where: { id: existing.id }, data: link! });
  }
  return tx.whatsappConversation.create({ data: { phone, ...(link ?? {}) } });
}

async function firstActiveAdmin(tx: Tx) {
  return tx.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ── Mensajes ─────────────────────────────────────────────────

/**
 * Registra un mensaje. Idempotente por `waMessageId`: Meta reintenta los
 * webhooks y n8n puede reenviar, así que un id repetido devuelve el mensaje
 * que ya estaba sin volver a tocar la conversación.
 *
 * Efectos en la conversación:
 * - Entrante: abre la ventana de 24 h, cancela los seguimientos pendientes,
 *   reabre una conversación CERRADA y atiende las palabras clave de la
 *   política ("DEJAR DE RECIBIR MENSAJES", "CANCELAR", "ELIMINAR MIS DATOS").
 * - Saliente del agente: programa el siguiente seguimiento.
 */
export async function recordMessage(agent: SessionUser, input: MessageInput) {
  if (input.waMessageId) {
    const existing = await findMessageByWaId(input.waMessageId);
    if (existing) return { creado: false, ...existing };
  }

  if (input.media) {
    if (!isMediaPathOf(input.telefono, input.media.ruta)) {
      throw new ValidationError(
        `La ruta del archivo debe estar en la carpeta del teléfono (${input.telefono}/…).`,
      );
    }
    const limit = MEDIA_LIMITS[input.media.mime];
    if (input.media.bytes && limit && input.media.bytes > limit.maxBytes) {
      throw new ValidationError("El archivo supera el tamaño permitido.");
    }
  }

  const at = messageTime(input.fecha);
  const inbound = input.direccion === "ENTRANTE";
  const author: MessageAuthor = input.autor ?? (inbound ? "CLIENTE" : "AGENTE_IA");
  const keyword: PolicyKeyword | null = inbound ? detectPolicyKeyword(input.texto) : null;

  const link = await resolveLink(input.telefono);

  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, `agente:telefono:${input.telefono}`);
      const conversation = await ensureConversation(tx, input.telefono, link);

      const message = await tx.whatsappMessage.create({
        data: {
          conversationId: conversation.id,
          waMessageId: input.waMessageId,
          direction: input.direccion,
          author,
          authorUserId:
            author === "AGENTE_IA"
              ? agent.id
              : author === "ASESOR"
                ? conversation.assignedUserId
                : null,
          type: input.tipo,
          body: input.texto,
          mediaPath: input.media?.ruta,
          mediaMime: input.media?.mime,
          mediaSizeBytes: input.media?.bytes,
          agentTrace:
            input.traza === undefined ? undefined : (input.traza as Prisma.InputJsonValue),
          createdAt: at,
        },
        select: messageSelect,
      });

      let followUp: FollowUpState | null = null;
      if (inbound) followUp = followUpAfterInbound();
      else if (author === "AGENTE_IA") {
        followUp = input.seguimiento
          ? followUpAfterFollowUpSent(conversation.followUpCount, at)
          : followUpAfterAgentMessage(at);
      }

      const isLatest = !conversation.lastMessageAt || at >= conversation.lastMessageAt;
      const updated = await tx.whatsappConversation.update({
        where: { id: conversation.id },
        data: {
          ...(isLatest ? { lastMessageAt: at } : {}),
          ...(inbound &&
          (!conversation.lastInboundAt || at > conversation.lastInboundAt)
            ? { lastInboundAt: at }
            : {}),
          ...(inbound && conversation.status === "CERRADA" ? { status: "BOT" } : {}),
          ...(followUp ?? {}),
          ...(keyword === "BAJA" ? { optOutAt: at, nextFollowUpAt: null } : {}),
        },
        select: { id: true, status: true },
      });

      if (keyword === "ELIMINAR_DATOS") {
        await requestDataDeletion(tx, conversation, input.telefono);
      }
      if (keyword === "BAJA" && conversation.clientId) {
        await tx.activity.create({
          data: {
            type: "NOTA",
            subject: "Pidió dejar de recibir mensajes por WhatsApp",
            notes: `Escribió "${input.texto}". No se le harán más seguimientos.`,
            userId: agent.id,
            clientId: conversation.clientId,
            completedAt: at,
          },
        });
      }

      return {
        creado: true,
        mensaje: toMessageView(message),
        conversacion: { id: updated.id, estado: updated.status },
        palabraClave: keyword,
      };
    });
  } catch (error) {
    // Dos entregas del mismo wamid en paralelo: gana la primera.
    if (input.waMessageId && isUniqueViolation(error)) {
      const existing = await findMessageByWaId(input.waMessageId);
      if (existing) return { creado: false, ...existing };
    }
    throw error;
  }
}

/**
 * "ELIMINAR MIS DATOS": la política da 10 días hábiles para responder. Se
 * crea la tarea al ADMIN; borrar es decisión de una persona, no del agente.
 */
async function requestDataDeletion(
  tx: Tx,
  conversation: { clientId: string | null },
  phone: string,
) {
  const admin = await firstActiveAdmin(tx);
  if (!admin) return;

  const due = new Date();
  due.setDate(due.getDate() + 14); // 10 días hábiles ≈ 2 semanas calendario

  await tx.activity.create({
    data: {
      type: "NOTA",
      subject: "Solicitud de supresión de datos (WhatsApp)",
      notes: [
        `El titular del número +${phone} escribió "ELIMINAR MIS DATOS".`,
        "La política de tratamiento de datos da 10 días hábiles para responder.",
      ].join("\n"),
      userId: admin.id,
      clientId: conversation.clientId,
      dueAt: due,
    },
  });
}

const messageSelect = {
  id: true,
  waMessageId: true,
  direction: true,
  author: true,
  type: true,
  createdAt: true,
  conversation: { select: { id: true, status: true } },
} as const;

function toMessageView(message: {
  id: string;
  waMessageId: string | null;
  direction: string;
  author: string;
  type: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    waMessageId: message.waMessageId,
    direccion: message.direction,
    autor: message.author,
    tipo: message.type,
    fecha: message.createdAt,
  };
}

async function findMessageByWaId(waMessageId: string) {
  const message = await prisma.whatsappMessage.findUnique({
    where: { waMessageId },
    select: messageSelect,
  });
  if (!message) return null;
  return {
    mensaje: toMessageView(message),
    conversacion: { id: message.conversation.id, estado: message.conversation.status },
    palabraClave: null,
  };
}

/** Webhook de estados de Meta: enviado → entregado → leído (o fallido). */
export async function updateDelivery(input: DeliveryInput) {
  const message = await prisma.whatsappMessage.findUnique({
    where: { waMessageId: input.waMessageId },
    select: { id: true, deliveryStatus: true },
  });
  if (!message) throw new NotFoundError("El mensaje");

  const next = nextDeliveryStatus(message.deliveryStatus, input.estado);
  if (next) {
    await prisma.whatsappMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: next },
    });
  }
  return { estado: next ?? message.deliveryStatus, actualizado: next !== null };
}

// ── Estado ───────────────────────────────────────────────────

/**
 * Lo que n8n consulta antes de responder: si contesta el bot o un asesor,
 * qué autorizó la persona, si la descartamos, cuál es el último entrante
 * (para agrupar mensajes seguidos) y si la ventana de 24 h sigue abierta.
 */
export async function getConversationState(phone: string) {
  const conversation = await prisma.whatsappConversation.findUnique({
    where: { phone },
    include: {
      assignedUser: { select: { id: true, name: true } },
      messages: {
        where: { direction: "ENTRANTE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, waMessageId: true, createdAt: true },
      },
    },
  });

  if (!conversation) {
    return {
      existe: false,
      telefono: phone,
      estado: "BOT" as const,
      asignadaA: null,
      clienteId: null,
      consentimiento: { aviso: null, versionPolitica: null, comercial: null, baja: null },
      descartada: null,
      ultimoEntrante: null,
      ventana: { abierta: false, cierraEn: null },
      seguimientos: { enviados: 0, proximo: null, maximo: MAX_FOLLOW_UPS },
      resumen: null,
    };
  }

  const window = serviceWindow(conversation.lastInboundAt);
  const lastInbound = conversation.messages[0];

  return {
    existe: true,
    telefono: phone,
    estado: conversation.status,
    asignadaA: conversation.assignedUser
      ? { id: conversation.assignedUser.id, nombre: conversation.assignedUser.name }
      : null,
    clienteId: conversation.clientId,
    consentimiento: {
      aviso: conversation.consentAt,
      versionPolitica: conversation.consentVersion,
      comercial: conversation.marketingConsentAt,
      baja: conversation.optOutAt,
    },
    descartada: conversation.disqualifiedAt
      ? { motivo: conversation.disqualifiedReason, fecha: conversation.disqualifiedAt }
      : null,
    ultimoEntrante: lastInbound
      ? { id: lastInbound.id, waMessageId: lastInbound.waMessageId, fecha: lastInbound.createdAt }
      : null,
    ventana: { abierta: window.open, cierraEn: window.closesAt },
    seguimientos: {
      enviados: conversation.followUpCount,
      proximo: conversation.nextFollowUpAt,
      maximo: MAX_FOLLOW_UPS,
    },
    resumen: conversation.summary,
  };
}

// ── Consentimiento y descarte ────────────────────────────────

/**
 * Registra lo que la persona autorizó, según la política de datos:
 * - AVISO: se entregó el aviso de privacidad (la conducta inequívoca de
 *   seguir escribiendo basta para atenderla).
 * - COMERCIAL: autorización expresa para seguimientos; retirarla los cancela.
 * - BAJA: no más mensajes comerciales. `acepta: false` la revierte si la
 *   persona vuelve a pedirlos.
 */
export async function setConsent(agent: SessionUser, input: ConsentInput) {
  const now = new Date();
  const link = await resolveLink(input.telefono);

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `agente:telefono:${input.telefono}`);
    const conversation = await ensureConversation(tx, input.telefono, link);

    const data: Prisma.WhatsappConversationUpdateInput =
      input.tipo === "AVISO"
        ? input.acepta
          ? { consentAt: now, consentVersion: input.versionPolitica ?? null }
          : { consentAt: null, consentVersion: null }
        : input.tipo === "COMERCIAL"
          ? input.acepta
            ? { marketingConsentAt: now }
            : { marketingConsentAt: null, nextFollowUpAt: null }
          : input.acepta
            ? { optOutAt: now, nextFollowUpAt: null }
            : { optOutAt: null };

    const updated = await tx.whatsappConversation.update({
      where: { id: conversation.id },
      data,
      select: {
        id: true,
        consentAt: true,
        consentVersion: true,
        marketingConsentAt: true,
        optOutAt: true,
      },
    });

    // Queda en la ficha del cliente como evidencia, si ya es cliente.
    if (conversation.clientId) {
      await tx.activity.create({
        data: {
          type: "NOTA",
          subject: consentSubject(input),
          notes: input.versionPolitica
            ? `Versión de la política: ${input.versionPolitica}`
            : undefined,
          userId: agent.id,
          clientId: conversation.clientId,
          completedAt: now,
        },
      });
    }

    return {
      conversacionId: updated.id,
      consentimiento: {
        aviso: updated.consentAt,
        versionPolitica: updated.consentVersion,
        comercial: updated.marketingConsentAt,
        baja: updated.optOutAt,
      },
    };
  });
}

function consentSubject(input: ConsentInput): string {
  if (input.tipo === "AVISO") {
    return input.acepta
      ? "Aviso de privacidad entregado por WhatsApp"
      : "Aviso de privacidad no aceptado";
  }
  if (input.tipo === "COMERCIAL") {
    return input.acepta
      ? "Autorizó comunicaciones comerciales por WhatsApp"
      : "Retiró la autorización de comunicaciones comerciales";
  }
  return input.acepta
    ? "Pidió dejar de recibir mensajes por WhatsApp"
    : "Volvió a aceptar mensajes por WhatsApp";
}

/**
 * Fuera de cobertura o sin negocio: la conversación se cierra con el motivo
 * y **no se crea cliente**, para no llenar el CRM de prospectos inválidos.
 * Si vuelve a escribir, se reabre en BOT con el descarte a la vista.
 */
export async function disqualify(input: DisqualifyInput) {
  const now = new Date();
  const link = await resolveLink(input.telefono);

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `agente:telefono:${input.telefono}`);
    const conversation = await ensureConversation(tx, input.telefono, link);

    const updated = await tx.whatsappConversation.update({
      where: { id: conversation.id },
      data: {
        status: "CERRADA",
        disqualifiedReason: input.motivo,
        disqualifiedAt: now,
        nextFollowUpAt: null,
        ...(input.detalle ? { summary: input.detalle } : {}),
      },
      select: { id: true, status: true, disqualifiedReason: true, disqualifiedAt: true },
    });

    return {
      conversacionId: updated.id,
      estado: updated.status,
      descartada: { motivo: updated.disqualifiedReason, fecha: updated.disqualifiedAt },
    };
  });
}

// ── Seguimientos ─────────────────────────────────────────────

/**
 * Conversaciones a las que toca escribirles un seguimiento ahora. La tarea
 * programada de n8n las recorre, envía (con plantilla si la ventana cerró) y
 * registra cada envío como saliente con `seguimiento: true`, que es lo que
 * programa el siguiente o los da por terminados.
 */
export async function listPendingFollowUps(limit: number) {
  const now = new Date();
  const conversations = await prisma.whatsappConversation.findMany({
    where: {
      status: "BOT",
      marketingConsentAt: { not: null },
      optOutAt: null,
      disqualifiedAt: null,
      followUpCount: { lt: MAX_FOLLOW_UPS },
      nextFollowUpAt: { lte: now },
    },
    orderBy: { nextFollowUpAt: "asc" },
    take: limit,
    include: {
      client: { select: { id: true, businessName: true, tradeName: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
  });

  return conversations.map((conversation) => ({
    conversacionId: conversation.id,
    telefono: conversation.phone,
    seguimientoNumero: conversation.followUpCount + 1,
    programadoPara: conversation.nextFollowUpAt,
    ventanaAbierta: serviceWindow(conversation.lastInboundAt, now).open,
    cliente: conversation.client
      ? {
          id: conversation.client.id,
          nombre: conversation.client.tradeName ?? conversation.client.businessName,
        }
      : null,
    contacto: conversation.contact
      ? [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(" ")
      : null,
    resumen: conversation.summary,
  }));
}

// ── Multimedia ───────────────────────────────────────────────

/**
 * Firma una subida directa a Storage. n8n descarga el archivo de Meta, lo
 * sube con `PUT` a `urlSubida` y luego registra el mensaje con
 * `media.ruta = ruta`. El binario nunca pasa por el CRM.
 */
export async function createMediaUpload(input: MediaUploadInput) {
  const limit = MEDIA_LIMITS[input.mime];
  if (input.bytes > limit.maxBytes) {
    throw new ValidationError(
      `El archivo pesa ${Math.ceil(input.bytes / 1024 / 1024)} MB; el máximo para ${input.mime} es ${limit.maxBytes / 1024 / 1024} MB.`,
    );
  }

  const path = mediaPath(input.telefono, input.mime, input.waMessageId ?? randomUUID());
  const signed = await createSignedUpload(path);

  return {
    ruta: signed.path,
    urlSubida: signed.uploadUrl,
    metodo: "PUT" as const,
    encabezados: { "Content-Type": input.mime, "x-upsert": "true" },
    expiraEn: new Date(Date.now() + 2 * 60 * 60 * 1000),
  };
}
