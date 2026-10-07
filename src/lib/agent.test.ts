import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import { AGENT_ROLE, isAssignableRole } from "./agent";

describe("isAssignableRole", () => {
  it("permite dar a una persona cualquier rol humano", () => {
    expect(isAssignableRole(UserRole.ADMIN)).toBe(true);
    expect(isAssignableRole(UserRole.VENDEDOR)).toBe(true);
    expect(isAssignableRole(UserRole.BODEGA)).toBe(true);
    expect(isAssignableRole(UserRole.DESPACHO)).toBe(true);
  });

  it("reserva el rol del agente IA", () => {
    expect(AGENT_ROLE).toBe(UserRole.AGENTE_IA);
    expect(isAssignableRole(UserRole.AGENTE_IA)).toBe(false);
  });
});
