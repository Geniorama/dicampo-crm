import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { createProduct, listProducts } from "@/server/services/catalog";
import {
  productCreateSchema,
  productListQuerySchema,
} from "@/server/validators/catalog";

export const runtime = "nodejs";

/** GET /api/catalogo/productos */
export const GET = route(async (request: NextRequest) => {
  await requireUser();
  const query = productListQuerySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );

  return ok(await listProducts(query));
});

/** POST /api/catalogo/productos — solo administración. */
export const POST = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = productCreateSchema.parse(await readJson(request));

  return created(await createProduct(input));
});
