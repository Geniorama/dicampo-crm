import { AppError } from "./errors";

/**
 * Supabase Storage para la multimedia de WhatsApp (bucket privado `wa-media`).
 *
 * Se habla con la API REST directamente: son dos llamadas y no justifican
 * otra dependencia. Los archivos nunca pasan por las funciones de Netlify
 * (límite de 6 MB por petición y pocos segundos de ejecución): el CRM firma
 * una URL de subida, n8n sube el binario directo a Storage, y para verlos el
 * CRM firma URLs de lectura de corta duración.
 *
 * Requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. La llave de servicio
 * solo vive en el servidor; n8n nunca la recibe.
 */

export const MEDIA_BUCKET = "wa-media";

class StorageUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503, "STORAGE_UNAVAILABLE");
  }
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StorageUnavailableError(
      "El almacenamiento de archivos no está configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return { base: `${url}/storage/v1`, key };
}

/** Codifica cada segmento de la ruta sin tocar las barras. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function storagePost<T>(
  endpoint: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const { base, key } = config();
  const response = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[storage] ${endpoint} → ${response.status}: ${detail}`);
    throw new StorageUnavailableError("No se pudo firmar el archivo en Storage.");
  }
  return (await response.json()) as T;
}

/**
 * URL para subir un archivo sin credenciales (vale 2 horas, la fija
 * Supabase). Se sube con `PUT` y el `Content-Type` del archivo.
 */
export async function createSignedUpload(path: string) {
  const { base } = config();
  const data = await storagePost<{ url: string }>(
    `/object/upload/sign/${MEDIA_BUCKET}/${encodePath(path)}`,
    {},
    // Si n8n reintenta la subida del mismo mensaje, reemplaza el archivo.
    { "x-upsert": "true" },
  );
  const signed = new URL(`${base}${data.url}`);
  return {
    path,
    uploadUrl: signed.toString(),
    token: signed.searchParams.get("token"),
  };
}

/** URL de lectura temporal, para reproducir un audio o ver una imagen. */
export async function createSignedDownload(path: string, expiresInSeconds = 600) {
  const { base } = config();
  const data = await storagePost<{ signedURL: string }>(
    `/object/sign/${MEDIA_BUCKET}/${encodePath(path)}`,
    { expiresIn: expiresInSeconds },
  );
  return `${base}${data.signedURL}`;
}
