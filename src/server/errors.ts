/**
 * Errores de dominio.
 *
 * Los servicios lanzan estos errores sin saber nada de HTTP; la capa de rutas
 * (`http.ts`) los traduce a códigos de estado. Así la lógica de negocio se
 * puede probar y reutilizar fuera de un request.
 */

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Sin sesión iniciada. */
export class UnauthorizedError extends AppError {
  constructor(message = "Debes iniciar sesión.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** Con sesión, pero sin permiso para esta operación. */
export class ForbiddenError extends AppError {
  constructor(message = "No tienes permisos para realizar esta acción.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "El recurso") {
    super(`${resource} no existe.`, 404, "NOT_FOUND");
  }
}

/** Conflicto con el estado actual: duplicados, concurrencia. */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/** Datos de entrada inválidos. */
export class ValidationError extends AppError {
  constructor(message = "Los datos enviados no son válidos.", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

/**
 * Una regla del negocio impide la operación: stock insuficiente, transición
 * de estado no permitida, cupo de crédito excedido.
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "BUSINESS_RULE", details);
  }
}
