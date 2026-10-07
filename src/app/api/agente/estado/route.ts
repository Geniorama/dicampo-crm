import { requireAgent } from "@/server/guards";
import { ok, route } from "@/server/http";

/**
 * Comprobación de credenciales para n8n: responde 200 con la identidad del
 * agente si la llave es válida y el usuario `AGENTE_IA` está activo; 401 o
 * 403 en caso contrario. Sirve para probar la conexión al configurar n8n.
 */
export const GET = route(async (request: Request) => {
  const agent = await requireAgent(request);
  return ok({ agent: { id: agent.id, name: agent.name, email: agent.email } });
});
