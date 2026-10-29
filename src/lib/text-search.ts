/**
 * Búsqueda de texto tolerante, para los selectores que filtran mientras se
 * escribe.
 *
 * "panaderia", "PANADERÍA" y "Panadería" son lo mismo: se comparan sin
 * mayúsculas ni tildes. Cada palabra escrita debe aparecer en el texto, en
 * cualquier orden y desde la primera letra: "trigo pan" encuentra
 * "Panadería El Trigo".
 */

/** Minúsculas, sin tildes ni diéresis, con los espacios colapsados. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    // Marcas diacríticas: separa la tilde de la letra y la borra (la ñ
    // también queda como n, que es como muchos la teclean).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras de la consulta, ya normalizadas. */
export function searchTerms(query: string): string[] {
  const normalized = normalizeSearch(query);
  return normalized === "" ? [] : normalized.split(" ");
}

/** `true` si todas las palabras están en el texto (ya normalizado). */
export function matchesTerms(normalizedText: string, terms: readonly string[]): boolean {
  return terms.every((term) => normalizedText.includes(term));
}
