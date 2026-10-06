import type { NextRequest } from "next/server";
import { ok, readJson, route } from "@/server/http";
import { authorizeImport } from "@/server/import/access";
import { runImport } from "@/server/services/imports";
import { importRunSchema } from "@/server/validators/imports";

export const runtime = "nodejs";

type Context = { params: Promise<{ entidad: string }> };

/**
 * POST /api/importar/:entidad — simula o ejecuta la carga.
 *
 * `dryRun` decide: por defecto simula. La simulación y la ejecución recorren
 * exactamente el mismo código, así que lo que anuncia la vista previa es lo
 * que pasará al confirmar.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const { entidad } = await context.params;
  const { key, user } = await authorizeImport(entidad);
  const input = importRunSchema.parse(await readJson(request));

  return ok(await runImport(user, key, input));
});
