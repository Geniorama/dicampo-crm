/** Parámetros de búsqueda tal como los entrega el App Router. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Aplana los parámetros a un objeto de strings, descartando los vacíos.
 *
 * Next.js entrega `string[]` cuando una clave se repite en la URL, y los
 * `<select>` sin selección envían "". Los esquemas Zod de filtros esperan
 * campos ausentes, no cadenas vacías.
 */
export function flattenSearchParams(
  params: RawSearchParams,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== "") result[key] = first;
  }

  return result;
}
