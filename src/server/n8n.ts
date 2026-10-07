import { AppError } from "./errors";

/**
 * Envío de mensajes de los asesores por WhatsApp.
 *
 * El CRM no habla con Meta: el token de Meta, la regla de las 24 horas del
 * lado del envío y los reintentos viven en n8n. El CRM llama a un webhook de
 * n8n que envía por Graph API y devuelve el id de Meta (wamid) del mensaje.
 *
 * Contrato del webhook (`N8N_ENVIO_WEBHOOK_URL`):
 * - POST JSON `{ telefono, texto, conversacionId, asesor: { id, nombre } }`
 * - Encabezado `X-CRM-Secret: <N8N_ENVIO_SECRET>`; n8n debe rechazar si no
 *   coincide.
 * - Respuesta 200 JSON `{ waMessageId }` cuando Meta aceptó el mensaje.
 */

class WhatsappSendError extends AppError {
  constructor(message: string, status = 502) {
    super(message, status, "WHATSAPP_SEND_FAILED");
  }
}

export type AdvisorMessagePayload = {
  telefono: string;
  texto: string;
  conversacionId: string;
  asesor: { id: string; nombre: string };
};

export async function sendViaN8n(
  payload: AdvisorMessagePayload,
): Promise<{ waMessageId: string | null }> {
  const url = process.env.N8N_ENVIO_WEBHOOK_URL;
  const secret = process.env.N8N_ENVIO_SECRET;
  if (!url || !secret) {
    throw new WhatsappSendError(
      "El envío por WhatsApp no está configurado (N8N_ENVIO_WEBHOOK_URL / N8N_ENVIO_SECRET).",
      503,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CRM-Secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("[n8n] no respondió el webhook de envío:", error);
    throw new WhatsappSendError("No se pudo contactar el servicio de envío. Intenta de nuevo.");
  }

  const body = (await response.json().catch(() => null)) as {
    waMessageId?: unknown;
    error?: unknown;
  } | null;

  if (!response.ok) {
    console.error(`[n8n] envío rechazado (${response.status}):`, body);
    throw new WhatsappSendError("WhatsApp no aceptó el mensaje. Revisa el número o intenta de nuevo.");
  }

  return {
    waMessageId: typeof body?.waMessageId === "string" ? body.waMessageId : null,
  };
}
