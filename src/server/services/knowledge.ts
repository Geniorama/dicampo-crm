import { prisma } from "../db";
import { AppError } from "../errors";
import type { KnowledgeSearchInput } from "../validators/knowledge";

/**
 * Búsqueda en la base de conocimiento del agente (DAIC-12).
 *
 * Los fragmentos viven en el esquema `kb` de esta misma base y los carga el
 * workflow de ingesta de n8n. Aquí solo se consulta: se pide el embedding de
 * la pregunta a OpenAI (el mismo modelo de la ingesta) y se llama a
 * `public.buscar_kb`, que fusiona búsqueda semántica y por palabras clave.
 *
 * Vive en el CRM para que la herramienta del agente sea una sola llamada
 * HTTP y la llave de OpenAI no tenga que estar en dos sitios para consultar.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

class KnowledgeUnavailableError extends AppError {
  constructor(message: string) {
    super(message, 503, "KNOWLEDGE_UNAVAILABLE");
  }
}

async function embed(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new KnowledgeUnavailableError("La base de conocimiento no está configurada (OPENAI_API_KEY).");
  }

  let response: Response;
  try {
    response = await fetch(`${(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "")}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new KnowledgeUnavailableError("No se pudo consultar el servicio de embeddings.");
  }
  if (!response.ok) {
    throw new KnowledgeUnavailableError(`El servicio de embeddings respondió ${response.status}.`);
  }

  const body = (await response.json()) as { data?: { embedding?: number[] }[] };
  const vector = body.data?.[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new KnowledgeUnavailableError("El servicio de embeddings devolvió una respuesta inesperada.");
  }
  return vector;
}

type KnowledgeRow = {
  id: bigint;
  fuente: string;
  titulo: string | null;
  seccion: string | null;
  categoria: string;
  contenido: string;
  similitud: number | null;
  score: number;
};

export async function searchKnowledge(input: KnowledgeSearchInput) {
  const vector = await embed(input.consulta);
  const literal = `[${vector.join(",")}]`;

  const rows = await prisma.$queryRaw<KnowledgeRow[]>`
    select id, fuente, titulo, seccion, categoria, contenido, similitud, score
    from public.buscar_kb(
      ${input.consulta}::text,
      ${literal}::extensions.vector,
      ${input.limite}::int,
      ${input.categoria ?? null}::text
    )`;

  return {
    consulta: input.consulta,
    resultados: rows.map((row) => ({
      titulo: row.titulo,
      seccion: row.seccion,
      categoria: row.categoria,
      contenido: row.contenido,
      fuente: row.fuente,
      similitud: row.similitud === null ? null : Math.round(row.similitud * 1000) / 1000,
    })),
  };
}
