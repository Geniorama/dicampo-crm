import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { addVariant } from "@/server/services/catalog";
import { variantCreateSchema } from "@/server/validators/catalog";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** POST /api/catalogo/productos/:id/variantes */
export const POST = route(async (request: NextRequest, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  const input = variantCreateSchema.parse(await readJson(request));

  return created(await addVariant(id, input));
});
