import { z } from "zod";

/** Categorías de `kb.fragmentos` (ver supabase/kb/001_kb_busqueda.sql). */
export const KNOWLEDGE_CATEGORIES = [
  "producto",
  "precio",
  "politica",
  "faq",
  "empresa",
  "general",
] as const;

export const knowledgeSearchSchema = z.object({
  consulta: z.string().trim().min(2, "consulta: mínimo 2 caracteres").max(500),
  /** Opcional: restringe a una categoría. El modelo suele mandar "" si no aplica. */
  categoria: z
    .union([z.enum(KNOWLEDGE_CATEGORIES), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  limite: z.coerce.number().int().min(1).max(10).default(5),
});
export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchSchema>;
