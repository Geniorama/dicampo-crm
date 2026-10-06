import type { NextRequest } from "next/server";
import { csvFilename } from "@/lib/csv";
import { toErrorResponse } from "@/server/http";
import { authorizeImport } from "@/server/import/access";
import { buildImportTemplate } from "@/server/services/imports";

export const runtime = "nodejs";

type Context = { params: Promise<{ entidad: string }> };

/**
 * GET /api/importar/:entidad/plantilla — CSV de ejemplo con una fila.
 *
 * No es obligatorio usarla: para eso está el cotejo de columnas. Sirve para
 * arrancar de cero y para ver qué admite cada campo.
 *
 * No usa el envoltorio `route()` porque devuelve texto, no el sobre JSON.
 */
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { entidad } = await context.params;
    const { key } = await authorizeImport(entidad);

    return new Response(buildImportTemplate(key), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(`plantilla-${key}`)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
