import { formatCOP } from "@/lib/format";
import type { TrendPoint } from "@/server/services/analytics";

/**
 * Barras de evolución de ventas.
 *
 * Dibujado con divs y no con una librería de gráficas: son barras verticales
 * simples y añadir una dependencia de ~50 kB al bundle para esto no se paga.
 * La tabla de datos va debajo para quien use lector de pantalla.
 */
export function TrendChart({
  points,
  granularity,
}: {
  points: TrendPoint[];
  granularity: "dia" | "mes";
}) {
  if (points.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        No hay ventas en el período seleccionado.
      </p>
    );
  }

  const max = Math.max(...points.map((point) => point.revenue));

  /** "2026-09-01" → "1 sep"; "2026-09" → "sep 2026" */
  function label(key: string): string {
    const [year, month, day] = key.split("-");
    const monthName = new Intl.DateTimeFormat("es-CO", { month: "short" })
      .format(new Date(Number(year), Number(month) - 1, 1))
      .replace(".", "");

    return day ? `${Number(day)} ${monthName}` : `${monthName} ${year}`;
  }

  return (
    <div className="px-5 py-4">
      <div
        className="flex h-48 items-end gap-1 overflow-x-auto"
        role="img"
        aria-label={`Evolución de ventas por ${granularity}. Máximo ${formatCOP(max)}.`}
      >
        {points.map((point) => {
          // Un mínimo visible evita que un día flojo desaparezca del gráfico.
          const height = max > 0 ? Math.max(2, (point.revenue / max) * 100) : 2;

          return (
            <div
              key={point.key}
              className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1"
              title={`${label(point.key)}: ${formatCOP(point.revenue)} · ${point.orders} ${point.orders === 1 ? "pedido" : "pedidos"}`}
            >
              <span className="tabular text-[10px] text-muted-foreground">
                {point.orders}
              </span>
              <div
                className="w-full rounded-t bg-brand-green transition-all"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto">
        {points.map((point) => (
          <span
            key={point.key}
            className="min-w-8 flex-1 truncate text-center text-[10px] text-muted-foreground"
          >
            {label(point.key)}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        La cifra sobre cada barra es el número de pedidos. Pasa el cursor para
        ver el valor.
      </p>
    </div>
  );
}
