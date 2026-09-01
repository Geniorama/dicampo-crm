import type { NextRequest } from "next/server";
import { requireAdmin, requireUser } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import {
  bulkUpdatePrices,
  createPriceList,
  listPriceLists,
} from "@/server/services/pricing";
import {
  priceBulkUpdateSchema,
  priceListCreateSchema,
} from "@/server/validators/catalog";

export const runtime = "nodejs";

/** GET /api/precios — listas de precios existentes. */
export const GET = route(async () => {
  await requireUser();
  return ok(await listPriceLists());
});

/** POST /api/precios — crea una lista. */
export const POST = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = priceListCreateSchema.parse(await readJson(request));

  return created(await createPriceList(input));
});

/** PATCH /api/precios — actualiza precios en bloque. */
export const PATCH = route(async (request: NextRequest) => {
  await requireAdmin();
  const input = priceBulkUpdateSchema.parse(await readJson(request));

  return ok({ updated: (await bulkUpdatePrices(input)).length });
});
