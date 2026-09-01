import type { NextRequest } from "next/server";
import { requireAdmin } from "@/server/guards";
import { ok, readJson, route } from "@/server/http";
import { updateVariant } from "@/server/services/catalog";
import { variantUpdateSchema } from "@/server/validators/catalog";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: NextRequest, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  const input = variantUpdateSchema.parse(await readJson(request));

  return ok(await updateVariant(id, input));
});
