import { onlyDigits } from "./nit";

/**
 * Enlaces de WhatsApp. Es el canal principal por el que Dicampo recibe
 * pedidos, así que el CRM abre la conversación en vez de reemplazarla.
 */

const COLOMBIA_CODE = "57";

/**
 * Normaliza un teléfono colombiano a E.164 sin el "+", como lo espera wa.me.
 *
 * - "310 729 6238"   → "573107296238"
 * - "+57 310 7296238" → "573107296238"
 * - "(601) 943 95 00" → "576019439500"
 *
 * Devuelve `null` si no queda un número plausible.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = onlyDigits(phone);
  if (digits.length === 0) return null;

  // Ya viene con indicativo de país.
  if (digits.startsWith(COLOMBIA_CODE) && digits.length >= 12) return digits;

  // Celular (10 dígitos, empieza por 3) o fijo con indicativo (10 dígitos).
  if (digits.length === 10) return `${COLOMBIA_CODE}${digits}`;

  // Fijo de Bogotá sin indicativo: se asume 601.
  if (digits.length === 7) return `${COLOMBIA_CODE}601${digits}`;

  return digits.length >= 10 ? digits : null;
}

/** Construye el enlace de WhatsApp con un mensaje opcional prellenado. */
export function whatsappLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const base = `https://wa.me/${normalized}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
