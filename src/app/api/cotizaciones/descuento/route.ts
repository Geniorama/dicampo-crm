import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, SALES_ROLES } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getQuoteDiscountPolicy } from "@/server/services/quotes";

export const runtime = "nodejs";

const querySchema = z.object({
  clientId: z.string().cuid(),
  addressId: z.string().cuid().optional(),
});

/**
 * GET /api/cotizaciones/descuento?clientId=&addressId= — descuento que
 * corresponde a ese cliente y sede (nuevo, negociación o manual).
 */
export const GET = route(async (request: NextRequest) => {
  const user = await requireUser(SALES_ROLES);
  const { clientId, addressId } = querySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await getQuoteDiscountPolicy(user, clientId, addressId));
});
