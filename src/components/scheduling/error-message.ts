import { ApiClientError } from "@/lib/api-client";

/**
 * Mensaje mostrable de un fallo de la API. En un 422 de Zod el mensaje
 * general ("Los datos enviados no son válidos") no dice qué corregir, así que
 * se prefiere el de la primera regla incumplida — p. ej. "Hay franjas que se
 * cruzan el mismo día".
 */
export function apiErrorMessage(caught: unknown, fallback: string): string {
  if (!(caught instanceof ApiClientError)) return fallback;

  if (Array.isArray(caught.details)) {
    const first = caught.details[0] as { message?: unknown } | undefined;
    if (typeof first?.message === "string") return first.message;
  }
  return caught.message;
}
