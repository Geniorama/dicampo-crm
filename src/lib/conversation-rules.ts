/**
 * Reglas de las conversaciones de WhatsApp que no necesitan base de datos:
 * ventana de 24 horas de Meta, calendario de seguimientos, palabras clave de
 * la política de datos y avance de los estados de entrega.
 */

const HOUR = 60 * 60 * 1000;

// ── Ventana de 24 horas ──────────────────────────────────────

/** Meta solo deja escribir texto libre dentro de las 24 h del último entrante. */
export const SERVICE_WINDOW_MS = 24 * HOUR;

export function serviceWindow(
  lastInboundAt: Date | null,
  now: Date = new Date(),
): { open: boolean; closesAt: Date | null } {
  if (!lastInboundAt) return { open: false, closesAt: null };
  const closesAt = new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS);
  return { open: closesAt.getTime() > now.getTime(), closesAt };
}

// ── Seguimientos ─────────────────────────────────────────────

/**
 * Seguimientos tras un silencio del prospecto, contados desde el último
 * mensaje del agente: a las 24 h, a las 72 h y a los 6 días (el
 * entrenamiento dice "5–7 días"). Nunca más de tres.
 */
export const FOLLOW_UP_OFFSETS_HOURS = [24, 72, 144] as const;
export const MAX_FOLLOW_UPS = FOLLOW_UP_OFFSETS_HOURS.length;

export type FollowUpState = { followUpCount: number; nextFollowUpAt: Date | null };

/** El prospecto respondió: se cancela cualquier seguimiento pendiente. */
export function followUpAfterInbound(): FollowUpState {
  return { followUpCount: 0, nextFollowUpAt: null };
}

/** El agente escribió (no un seguimiento): arranca el reloj de 24 h. */
export function followUpAfterAgentMessage(at: Date): FollowUpState {
  return {
    followUpCount: 0,
    nextFollowUpAt: new Date(at.getTime() + FOLLOW_UP_OFFSETS_HOURS[0] * HOUR),
  };
}

/**
 * Se envió el seguimiento número `sentCount + 1`. El siguiente queda a la
 * distancia que separa los dos escalones; tras el tercero, no hay más.
 */
export function followUpAfterFollowUpSent(
  previousCount: number,
  at: Date,
): FollowUpState {
  const followUpCount = Math.min(previousCount + 1, MAX_FOLLOW_UPS);
  if (followUpCount >= MAX_FOLLOW_UPS) {
    return { followUpCount, nextFollowUpAt: null };
  }
  const gapHours =
    FOLLOW_UP_OFFSETS_HOURS[followUpCount] - FOLLOW_UP_OFFSETS_HOURS[followUpCount - 1];
  return { followUpCount, nextFollowUpAt: new Date(at.getTime() + gapHours * HOUR) };
}

/**
 * ¿Se le puede escribir un seguimiento? La política de Dicampo exige
 * autorización expresa para comunicaciones comerciales y respetar la baja; un
 * descartado o una conversación en manos de un asesor no se persigue.
 */
export function canFollowUp(conversation: {
  status: string;
  marketingConsentAt: Date | null;
  optOutAt: Date | null;
  disqualifiedAt: Date | null;
  followUpCount: number;
}): boolean {
  return (
    conversation.status === "BOT" &&
    conversation.marketingConsentAt !== null &&
    conversation.optOutAt === null &&
    conversation.disqualifiedAt === null &&
    conversation.followUpCount < MAX_FOLLOW_UPS
  );
}

// ── Palabras clave de la política de datos ───────────────────

export type PolicyKeyword = "BAJA" | "ELIMINAR_DATOS";

function normalizeKeyword(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecta las instrucciones que publica la política: "DEJAR DE RECIBIR
 * MENSAJES" o "CANCELAR" dan de baja; "ELIMINAR MIS DATOS" pide supresión.
 * Solo cuenta si el mensaje es exactamente la instrucción: "quiero cancelar
 * el pedido" no es una baja.
 */
export function detectPolicyKeyword(text: string | null | undefined): PolicyKeyword | null {
  if (!text) return null;
  const normalized = normalizeKeyword(text);
  if (normalized === "DEJAR DE RECIBIR MENSAJES" || normalized === "CANCELAR") {
    return "BAJA";
  }
  if (normalized === "ELIMINAR MIS DATOS") return "ELIMINAR_DATOS";
  return null;
}

// ── Estados de entrega ───────────────────────────────────────

export const DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * Los webhooks de Meta llegan desordenados: un "delivered" tardío no debe
 * pisar un "read". El estado solo avanza; "failed" es definitivo.
 */
export function nextDeliveryStatus(
  current: string | null,
  incoming: DeliveryStatus,
): DeliveryStatus | null {
  if (current === null) return incoming;
  const currentRank = DELIVERY_RANK[current as DeliveryStatus] ?? 0;
  if (current === "failed") return null;
  return DELIVERY_RANK[incoming] > currentRank ? incoming : null;
}

// ── Multimedia ───────────────────────────────────────────────

/** Tipos que Meta entrega por WhatsApp y límites de tamaño en bytes. */
export const MEDIA_LIMITS: Record<string, { ext: string; maxBytes: number }> = {
  "audio/ogg": { ext: "ogg", maxBytes: 16 * 1024 * 1024 },
  "audio/mpeg": { ext: "mp3", maxBytes: 16 * 1024 * 1024 },
  "audio/mp4": { ext: "m4a", maxBytes: 16 * 1024 * 1024 },
  "audio/aac": { ext: "aac", maxBytes: 16 * 1024 * 1024 },
  "audio/amr": { ext: "amr", maxBytes: 16 * 1024 * 1024 },
  "image/jpeg": { ext: "jpg", maxBytes: 5 * 1024 * 1024 },
  "image/png": { ext: "png", maxBytes: 5 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 5 * 1024 * 1024 },
  "application/pdf": { ext: "pdf", maxBytes: 20 * 1024 * 1024 },
};

/** Quita parámetros: "audio/ogg; codecs=opus" → "audio/ogg". */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/**
 * Ruta del archivo en el bucket: carpeta por teléfono y por mes, nombre por
 * id de Meta (o uno aleatorio). Solo caracteres seguros para una URL.
 */
export function mediaPath(
  phone: string,
  mime: string,
  name: string,
  at: Date = new Date(),
): string {
  const limits = MEDIA_LIMITS[baseMime(mime)];
  if (!limits) throw new Error(`Tipo de archivo no permitido: ${mime}`);
  const month = at.toISOString().slice(0, 7);
  const safeName = name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  return `${phone}/${month}/${safeName}.${limits.ext}`;
}

/** La ruta pertenece a la carpeta de ese teléfono y no escapa de ella. */
export function isMediaPathOf(phone: string, path: string): boolean {
  return path.startsWith(`${phone}/`) && !path.includes("..") && !path.includes("//");
}
