import type { NextRequest } from "next/server";
import { requireAgent } from "@/server/guards";
import { created, readJson, route } from "@/server/http";
import { createMediaUpload } from "@/server/services/conversations";
import { mediaUploadSchema } from "@/server/validators/conversations";

export const runtime = "nodejs";

/**
 * POST /api/agente/conversaciones/media — firma una subida directa a
 * Supabase Storage (bucket privado wa-media). n8n sube el archivo con PUT a
 * `urlSubida` y después registra el mensaje con `media.ruta`.
 */
export const POST = route(async (request: NextRequest) => {
  await requireAgent(request);
  const input = mediaUploadSchema.parse(await readJson(request));

  return created(await createMediaUpload(input));
});
