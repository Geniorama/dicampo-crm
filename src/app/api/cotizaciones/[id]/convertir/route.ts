import type { NextRequest } from "next/server";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { convertQuoteToOrder } from "@/server/services/quotes";
import { quoteConvertSchema } from "@/server/validators/quotes";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/:id/convertir — acepta la cotización y crea el pedido. */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(SALES_ROLES);
  const { id } = await context.params;
  const input = quoteConvertSchema.parse(await readJson(request));

  return created(await convertQuoteToOrder(user, id, input));
});
