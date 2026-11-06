/**
 * Barras agrupadas por mes, con dos series. Dibujado con divs, como
 * `TrendChart`: no justifica una librería de gráficas. Cada serie lleva su
 * color y su rótulo en la leyenda; la tabla bajo la gráfica es para lectores
 * de pantalla.
 */
export type GroupedSeries = {
  key: string;
  label: string;
  /** Color CSS de la barra, p. ej. "var(--info)". */
  color: string;
};

export type GroupedPoint = { key: string; values: Record<string, number> };

/** "2026-09" → "sep" */
function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(".", "");
}

export function GroupedBars({
  title,
  series,
  points,
  format,
}: {
  title: string;
  series: GroupedSeries[];
  points: GroupedPoint[];
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...points.flatMap((point) => series.map((s) => point.values[s.key] ?? 0)));

  return (
    <div className="px-5 py-4">
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="flex h-48 items-end gap-3" role="img" aria-label={title}>
        {points.map((point) => (
          <div key={point.key} className="flex h-full min-w-10 flex-1 flex-col justify-end gap-1">
            <div className="flex flex-1 items-end justify-center gap-1">
              {series.map((s) => {
                const value = point.values[s.key] ?? 0;
                const height = max > 0 ? Math.max(value > 0 ? 3 : 1, (value / max) * 100) : 1;
                return (
                  <div
                    key={s.key}
                    className="w-full max-w-6 rounded-t"
                    style={{ height: `${height}%`, background: s.color }}
                    title={`${monthLabel(point.key)} · ${s.label}: ${format(value)}`}
                  />
                );
              })}
            </div>
            <span className="text-center text-[11px] text-muted-foreground">{monthLabel(point.key)}</span>
          </div>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row">{point.key}</th>
              {series.map((s) => (
                <td key={s.key}>{format(point.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
