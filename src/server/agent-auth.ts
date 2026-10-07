import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { AGENT_ROLE } from "@/lib/agent";
import type { SessionUser } from "./guards";

/**
 * Autenticación del agente IA de WhatsApp (n8n) contra `/api/agente/*`.
 *
 * El agente no tiene sesión: envía `Authorization: Bearer <llave>`. La llave
 * vive en `AGENTE_API_KEY`; durante una rotación, la anterior sigue valiendo
 * desde `AGENTE_API_KEY_ANTERIOR` hasta que n8n use la nueva.
 *
 * Validar la llave solo prueba que quien llama es n8n. Las acciones se
 * registran a nombre del usuario `AGENTE_IA`, y desactivar ese usuario en
 * /usuarios es el interruptor que apaga la integración sin tocar n8n.
 */

/** Longitud mínima aceptada: una llave corta se trata como no configurada. */
export const MIN_AGENT_KEY_LENGTH = 32;

const INVALID_KEY = "Llave del agente inválida o ausente.";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Extrae la llave de `Authorization: Bearer <llave>`, o `null`. */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/** Llaves vigentes: la actual y, si hay rotación en curso, la anterior. */
export function configuredAgentKeys(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return [env.AGENTE_API_KEY, env.AGENTE_API_KEY_ANTERIOR]
    .map((key) => key?.trim() ?? "")
    .filter((key) => key.length >= MIN_AGENT_KEY_LENGTH);
}

/**
 * Compara la llave recibida con las vigentes en tiempo constante.
 *
 * Se comparan los SHA-256 y no las llaves: así ambos lados miden lo mismo
 * (`timingSafeEqual` exige igual longitud) y no se filtra la longitud de la
 * llave real. Se revisan todas las candidatas, sin salir en la primera.
 */
export function matchesAgentKey(
  token: string | null,
  keys: readonly string[],
): boolean {
  if (!token || keys.length === 0) return false;

  const received = digest(token);
  let matched = false;
  for (const key of keys) {
    if (timingSafeEqual(received, digest(key))) matched = true;
  }
  return matched;
}

let warnedMissingKey = false;

/**
 * Exige la llave del agente y devuelve su usuario, con la misma forma que un
 * usuario de sesión para reutilizar los servicios.
 *
 * - Llave ausente, inválida o sin configurar en el servidor → 401.
 * - Usuario del agente desactivado o inexistente → 403.
 */
export async function requireAgent(request: Request): Promise<SessionUser> {
  const keys = configuredAgentKeys();
  if (keys.length === 0 && !warnedMissingKey) {
    warnedMissingKey = true;
    console.error(
      `[agente] AGENTE_API_KEY no está configurada (mínimo ${MIN_AGENT_KEY_LENGTH} caracteres): se rechazan todas las llamadas del agente.`,
    );
  }

  const token = readBearerToken(request.headers.get("authorization"));
  if (!matchesAgentKey(token, keys)) throw new UnauthorizedError(INVALID_KEY);

  const agent = await prisma.user.findFirst({
    where: { role: AGENT_ROLE },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!agent) {
    throw new ForbiddenError(
      "El usuario del agente IA no existe. Corre la semilla (npm run db:seed).",
    );
  }
  if (!agent.active) {
    throw new ForbiddenError("La integración del agente IA está desactivada.");
  }

  return { id: agent.id, name: agent.name, email: agent.email, role: agent.role };
}
