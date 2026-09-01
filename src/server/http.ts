import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ValidationError } from "./errors";

/**
 * Capa HTTP de la API interna.
 *
 * Los route handlers deben limitarse a: validar la entrada, llamar a un
 * servicio y devolver el resultado. Todo el manejo de errores vive aquí.
 */

export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: { message: string; code: string; details?: unknown };
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiSuccess<T>>({ data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/** Traduce cualquier excepción a una respuesta JSON con el estado correcto. */
export function toErrorResponse(error: unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    const validation = new ValidationError(
      "Los datos enviados no son válidos.",
      error.issues,
    );
    return NextResponse.json<ApiFailure>(
      {
        error: {
          message: validation.message,
          code: validation.code,
          details: validation.details,
        },
      },
      { status: validation.status },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json<ApiFailure>(
      {
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  // Un error inesperado no debe filtrar detalles internos al cliente.
  console.error("[api] error no controlado:", error);
  return NextResponse.json<ApiFailure>(
    {
      error: {
        message: "Ocurrió un error inesperado. Intenta de nuevo.",
        code: "INTERNAL_ERROR",
      },
    },
    { status: 500 },
  );
}

/**
 * Envuelve un route handler para centralizar el manejo de errores.
 *
 * ```ts
 * export const GET = route(async () => {
 *   const user = await requireUser();
 *   return ok(await listClients(user));
 * });
 * ```
 */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Lee y parsea el cuerpo JSON, con un error claro si viene malformado. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("El cuerpo de la petición no es JSON válido.");
  }
}
