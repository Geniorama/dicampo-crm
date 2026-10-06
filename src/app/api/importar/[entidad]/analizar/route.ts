import type { NextRequest } from "next/server";
import { ValidationError } from "@/server/errors";
import { ok, route } from "@/server/http";
import { authorizeImport } from "@/server/import/access";
import { analyzeImport } from "@/server/services/imports";

export const runtime = "nodejs";

// En Next.js 15 los parámetros de ruta llegan como promesa.
type Context = { params: Promise<{ entidad: string }> };

/**
 * POST /api/importar/:entidad/analizar — sube el archivo y devuelve sus
 * columnas, sus filas y el cotejo propuesto.
 *
 * No guarda nada: el archivo se lee, se convierte en filas y son esas filas
 * las que vuelven al navegador para cotejarlas. Así no quedan archivos a
 * medio importar ni hay que limpiarlos después.
 */
export const POST = route(async (request: NextRequest, context: Context) => {
  const { entidad } = await context.params;
  const { key } = await authorizeImport(entidad);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ValidationError("No se recibió el archivo.");
  }

  const file = form.get("archivo");
  if (!(file instanceof File)) {
    throw new ValidationError("Adjunta un archivo CSV o XLSX.");
  }

  const sheet = form.get("hoja");

  return ok(
    await analyzeImport(
      key,
      file,
      typeof sheet === "string" && sheet !== "" ? sheet : undefined,
    ),
  );
});
