import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();
vi.mock("./db", () => ({ prisma: { user: { findFirst } } }));

const {
  configuredAgentKeys,
  matchesAgentKey,
  readBearerToken,
  requireAgent,
} = await import("./agent-auth");
const { ForbiddenError, UnauthorizedError } = await import("./errors");

const KEY = "k".repeat(40);
const OLD_KEY = "o".repeat(40);

const agentUser = {
  id: "agent-1",
  name: "Agente IA WhatsApp",
  email: "agente-ia@dicampo.co",
  role: "AGENTE_IA",
  active: true,
};

function request(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/agente/estado", { headers });
}

describe("readBearerToken", () => {
  it("extrae la llave del encabezado Bearer", () => {
    expect(readBearerToken(`Bearer ${KEY}`)).toBe(KEY);
    expect(readBearerToken(`bearer   ${KEY}  `)).toBe(KEY);
  });

  it("rechaza encabezados ausentes o con otro esquema", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("")).toBeNull();
    expect(readBearerToken(`Basic ${KEY}`)).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
    expect(readBearerToken(`Bearer ${KEY} extra`)).toBeNull();
  });
});

describe("configuredAgentKeys", () => {
  it("toma la llave actual y la anterior", () => {
    expect(
      configuredAgentKeys({ AGENTE_API_KEY: KEY, AGENTE_API_KEY_ANTERIOR: OLD_KEY }),
    ).toEqual([KEY, OLD_KEY]);
  });

  it("ignora llaves vacías o demasiado cortas", () => {
    expect(configuredAgentKeys({})).toEqual([]);
    expect(
      configuredAgentKeys({ AGENTE_API_KEY: "corta", AGENTE_API_KEY_ANTERIOR: "  " }),
    ).toEqual([]);
  });
});

describe("matchesAgentKey", () => {
  it("acepta la llave actual y la anterior", () => {
    expect(matchesAgentKey(KEY, [KEY, OLD_KEY])).toBe(true);
    expect(matchesAgentKey(OLD_KEY, [KEY, OLD_KEY])).toBe(true);
  });

  it("rechaza llaves distintas, de otra longitud o sin configurar", () => {
    expect(matchesAgentKey("x".repeat(40), [KEY])).toBe(false);
    expect(matchesAgentKey(KEY.slice(1), [KEY])).toBe(false);
    expect(matchesAgentKey(null, [KEY])).toBe(false);
    expect(matchesAgentKey(KEY, [])).toBe(false);
  });
});

describe("requireAgent", () => {
  beforeEach(() => {
    vi.stubEnv("AGENTE_API_KEY", KEY);
    vi.stubEnv("AGENTE_API_KEY_ANTERIOR", OLD_KEY);
    findFirst.mockReset();
    findFirst.mockResolvedValue(agentUser);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("con llave válida devuelve el usuario del agente", async () => {
    await expect(requireAgent(request(`Bearer ${KEY}`))).resolves.toEqual({
      id: "agent-1",
      name: "Agente IA WhatsApp",
      email: "agente-ia@dicampo.co",
      role: "AGENTE_IA",
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "AGENTE_IA" } }),
    );
  });

  it("acepta la llave anterior durante una rotación", async () => {
    await expect(requireAgent(request(`Bearer ${OLD_KEY}`))).resolves.toMatchObject({
      id: "agent-1",
    });
  });

  it("rechaza con 401 una llave inválida sin consultar la base", async () => {
    const error = await requireAgent(request("Bearer otra-llave")).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rechaza con 401 si no viene la llave", async () => {
    await expect(requireAgent(request())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rechaza todo si el servidor no tiene llave configurada", async () => {
    vi.stubEnv("AGENTE_API_KEY", "");
    vi.stubEnv("AGENTE_API_KEY_ANTERIOR", "");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(requireAgent(request("Bearer "))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(requireAgent(request(`Bearer ${KEY}`))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    spy.mockRestore();
  });

  it("deja de aceptar la llave anterior al terminar la rotación", async () => {
    vi.stubEnv("AGENTE_API_KEY_ANTERIOR", "");
    await expect(requireAgent(request(`Bearer ${OLD_KEY}`))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rechaza con 403 si el usuario del agente está desactivado", async () => {
    findFirst.mockResolvedValue({ ...agentUser, active: false });
    const error = await requireAgent(request(`Bearer ${KEY}`)).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.status).toBe(403);
  });

  it("rechaza con 403 si el usuario del agente no existe", async () => {
    findFirst.mockResolvedValue(null);
    await expect(requireAgent(request(`Bearer ${KEY}`))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
