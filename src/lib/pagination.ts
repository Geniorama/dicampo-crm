/**
 * Números que se muestran en el paginador: siempre la primera y la última
 * página, la actual con `siblings` vecinas a cada lado y "…" en los saltos.
 * Un salto de una sola página se rellena con ese número, porque "…" ocuparía
 * el mismo lugar.
 */
export type PageItem = number | "gap";

export function pageItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  if (totalPages <= 1) return [1];

  const current = Math.min(Math.max(1, page), totalPages);
  const wanted = new Set<number>([1, totalPages]);
  for (let n = current - siblings; n <= current + siblings; n++) {
    if (n >= 1 && n <= totalPages) wanted.add(n);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const items: PageItem[] = [];
  sorted.forEach((n, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined) {
      if (n - previous === 2) items.push(previous + 1);
      else if (n - previous > 2) items.push("gap");
    }
    items.push(n);
  });
  return items;
}
