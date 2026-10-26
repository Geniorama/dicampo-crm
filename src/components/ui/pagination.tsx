import Link from "next/link";
import { pageItems } from "@/lib/pagination";
import type { RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

const BASE = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2.5 text-sm";
const IDLE = "border-border text-muted-foreground hover:bg-muted";

/**
 * Paginador con números: anterior, siguiente y salto directo a una página.
 * Conserva los filtros de la URL, incluidos los que se repiten (?hojas=a&hojas=b).
 */
export function Pagination({
  pathname,
  params,
  page,
  totalPages,
  total,
}: {
  pathname: string;
  params: RawSearchParams;
  page: number;
  totalPages: number;
  /** Total de registros; si se da, se muestra junto a la página. */
  total?: number;
}) {
  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== "") search.append(key, item);
      }
    }
    search.set("page", String(target));
    return `${pathname}?${search.toString()}`;
  };

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-muted-foreground">
        Página {page} de {totalPages}
        {total !== undefined && ` · ${total.toLocaleString("es-CO")} registros`}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={cn(BASE, IDLE)}>
              Anterior
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BASE, "border-transparent text-muted-foreground/50")}>
              Anterior
            </span>
          )}
        </li>
        {pageItems(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className={cn(BASE, "tabular border-primary bg-primary font-medium text-primary-foreground")}
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefFor(item)}
                  aria-label={`Ir a la página ${item}`}
                  className={cn(BASE, "tabular", IDLE)}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)} className={cn(BASE, IDLE)}>
              Siguiente
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(BASE, "border-transparent text-muted-foreground/50")}>
              Siguiente
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
