import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { getProduct, updateProduct } from "@/server/services/catalog";
import { productUpdateSchema } from "@/server/validators/catalog";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: NextRequest, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  return ok(await getProduct(id));
});

export const PATCH = route(async (request: NextRequest, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  const input = productUpdateSchema.parse(await readJson(request));

  return ok(await updateProduct(id, input));
});
