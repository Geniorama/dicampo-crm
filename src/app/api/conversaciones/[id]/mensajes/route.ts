import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { sendAdvisorMessage } from "@/server/services/supervision";
import { advisorReplySchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/conversaciones/:id/mensajes — el asesor responde. El CRM llama al
 * webhook de n8n, que envía por Meta; exige haber tomado la conversación y la
 * ventana de 24 h abierta.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = advisorReplySchema.parse(await readJson(request));
  return created(await sendAdvisorMessage(user, id, input));
});
