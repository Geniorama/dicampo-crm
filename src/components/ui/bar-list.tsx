import { cn } from "@/lib/utils";

export type BarListRow = {
  key: string;
  label: string;
  /** Texto pequeño junto a la etiqueta (presentación, número de pedidos…). */
  hint?: string;
  value: number;
  /** Valor ya formateado para mostrar a la derecha. */
  display: string;
  /** Clase de color de la barra; por defecto el verde primario. */
  barClass?: string;
};

/**
 * Barras horizontales ordenadas como se reciben. Cada barra se escala contra el
 * mayor valor de la lista; el valor exacto va escrito, así que no depende del
 * color ni del cursor para leerse.
 */
export function BarList({
  rows,
  label,
  className,
}: {
  rows: BarListRow[];
  /** Descripción para lectores de pantalla. */
  label: string;
  className?: string;
}) {
  const max = Math.max(0, ...rows.map((row) => row.value));

  return (
    <ul aria-label={label} className={cn("divide-y divide-border", className)}>
      {rows.map((row) => (
        <li key={row.key} className="px-5 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm text-foreground">
              {row.label}
              {row.hint && (
                <span className="ml-1 text-xs text-muted-foreground">{row.hint}</span>
              )}
            </p>
            <span className="tabular shrink-0 text-sm font-medium text-foreground">
              {row.display}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", row.barClass ?? "bg-primary")}
              style={{ width: `${max > 0 ? Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
