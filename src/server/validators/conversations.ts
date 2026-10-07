import { z } from "zod";
import {
  DisqualificationReason,
  MessageAuthor,
  MessageDirection,
  MessageType,
} from "@/generated/prisma/enums";
import { DELIVERY_STATUSES, MEDIA_LIMITS, baseMime } from "@/lib/conversation-rules";
import { phoneSchema } from "./agent";

/**
 * Contratos de `/api/agente/conversaciones/*` y `/api/agente/seguimientos/*`.
 * En español, como el resto de la API del agente.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

const mimeSchema = z
  .string()
  .trim()
  .transform(baseMime)
  .refine((mime) => mime in MEDIA_LIMITS, {
    message: `Tipo no permitido. Se aceptan: ${Object.keys(MEDIA_LIMITS).join(", ")}`,
  });

export const messageSchema = z
  .object({
    telefono: phoneSchema,
    /** Id de Meta (wamid). Opcional solo para mensajes que no salieron por Meta. */
    waMessageId: z.string().trim().min(1).max(200).optional(),
    direccion: z.enum(MessageDirection),
    /** Por defecto: ENTRANTE → CLIENTE, SALIENTE → AGENTE_IA */
    autor: z.enum(MessageAuthor).optional(),
    tipo: z.enum(MessageType).default(MessageType.TEXTO),
    /** Texto, o la transcripción de un audio / descripción de una imagen */
    texto: optionalText(10_000),
    media: z
      .object({
        ruta: z.string().trim().min(3).max(300),
        mime: mimeSchema,
        bytes: z.coerce.number().int().positive().optional(),
      })
      .optional(),
    /** Marca el saliente como uno de los seguimientos programados */
    seguimiento: z.boolean().default(false),
    /** Herramientas y fuentes que usó el agente para responder */
    traza: z.unknown().optional(),
    /** Hora del mensaje según Meta; si falta, la de llegada */
    fecha: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((data) => data.texto !== undefined || data.media !== undefined, {
    message: "El mensaje necesita texto o un archivo.",
  })
  .refine(
    (data) => !(data.direccion === MessageDirection.ENTRANTE && data.autor && data.autor !== MessageAuthor.CLIENTE),
    { path: ["autor"], message: "Un mensaje entrante siempre es del cliente." },
  )
  .refine(
    (data) => !(data.seguimiento && data.direccion !== MessageDirection.SALIENTE),
    { path: ["seguimiento"], message: "Solo un saliente puede ser seguimiento." },
  );
export type MessageInput = z.infer<typeof messageSchema>;

export const phoneQuerySchema = z.object({ telefono: phoneSchema });

export const consentSchema = z.object({
  telefono: phoneSchema,
  /**
   * AVISO: se entregó el aviso de privacidad (habilita atender).
   * COMERCIAL: autoriza o retira comunicaciones comerciales (seguimientos).
   * BAJA: pidió dejar de recibir mensajes.
   */
  tipo: z.enum(["AVISO", "COMERCIAL", "BAJA"]),
  acepta: z.boolean().default(true),
  versionPolitica: optionalText(50),
});
export type ConsentInput = z.infer<typeof consentSchema>;

export const disqualifySchema = z.object({
  telefono: phoneSchema,
  motivo: z.enum(DisqualificationReason),
  detalle: optionalText(1000),
});
export type DisqualifyInput = z.infer<typeof disqualifySchema>;

export const deliverySchema = z.object({
  waMessageId: z.string().trim().min(1).max(200),
  estado: z.enum(DELIVERY_STATUSES),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;

export const mediaUploadSchema = z.object({
  telefono: phoneSchema,
  mime: mimeSchema,
  bytes: z.coerce.number().int().positive(),
  /** Id de Meta del mensaje, para nombrar el archivo */
  waMessageId: z.string().trim().min(1).max(200).optional(),
});
export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;

export const pendingFollowUpsQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
});
