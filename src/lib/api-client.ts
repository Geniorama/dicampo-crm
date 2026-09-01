/**
 * Cliente HTTP para hablar con la API interna desde el navegador.
 *
 * Normaliza el sobre `{ data }` / `{ error }` que devuelve `src/server/http.ts`
 * y convierte los fallos en una excepción con mensaje mostrable al usuario.
 */

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  /** Detalle de validación de Zod, cuando el error es 422. */
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiClientError(
      error?.message ?? "No se pudo completar la operación.",
      response.status,
      error?.code ?? "UNKNOWN",
      error?.details,
    );
  }

  return payload?.data as T;
}

export const api = {
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
};
