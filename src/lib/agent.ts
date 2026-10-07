import type { UserRole } from "@/generated/prisma/enums";

/**
 * Identidad del agente IA de WhatsApp dentro del CRM.
 *
 * El agente existe como un usuario más porque la bitácora (`Activity.userId`)
 * y las conversaciones necesitan un autor. Tiene su propio rol, `AGENTE_IA`,
 * sin contraseña: no puede iniciar sesión ni usar la API interna, y entra
 * solo por `/api/agente` con API key.
 *
 * Desactivar este usuario desde la pantalla de usuarios apaga la integración.
 */

export const AGENT_USER_EMAIL = "agente-ia@dicampo.co";
export const AGENT_USER_NAME = "Agente IA WhatsApp";

/** Rol del agente. No se le asigna a personas: se excluye de los formularios. */
export const AGENT_ROLE = "AGENTE_IA" satisfies UserRole;

/** Roles que un ADMIN puede asignar a una persona desde la interfaz. */
export function isAssignableRole(role: UserRole): boolean {
  return role !== AGENT_ROLE;
}
