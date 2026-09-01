import type { NextRequest } from "next/server";
import { requireUser } from "@/server/guards";
import { ok, route } from "@/server/http";
import { getKardex } from "@/server/services/inventory";

export const runtime = "nodejs";

type Context = { params: Promise<{ variantId: string }> };

/** GET /api/inventario/kardex/:variantId */
export const GET = route(async (_request: NextRequest, context: Context) => {
  await requireUser();
  const { variantId } = await context.params;

  return ok(await getKardex(variantId));
});
