export type DonutSlice = {
  key: string;
  label: string;
  value: number;
  /** Color CSS del segmento (admite var(--token)). */
  color: string;
};

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Dona de proporciones. La leyenda lleva la cifra y el porcentaje de cada
 * segmento, así que el color nunca es la única forma de leerla.
 */
export function DonutChart({
  slices,
  label,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[];
  label: string;
  centerLabel: string;
  centerValue: string;
}) {
  const visible = slices.filter((slice) => slice.value > 0);
  const total = visible.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sin datos todavía.</p>;
  }

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6 px-5 py-4">
      <svg viewBox="0 0 100 100" role="img" aria-label={label} className="size-36 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="14" />
        {visible.map((slice) => {
          const length = (slice.value / total) * CIRCUMFERENCE;
          const circle = (
            <circle
              key={slice.key}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={slice.color}
              strokeWidth="14"
              strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
        <g className="rotate-90 origin-center">
          <text x="50" y="49" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
            {centerValue}
          </text>
          <text x="50" y="60" textAnchor="middle" className="fill-muted-foreground text-[6px]">
            {centerLabel}
          </text>
        </g>
      </svg>

      <ul className="min-w-44 flex-1 space-y-1.5 text-sm">
        {visible.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 text-foreground">{slice.label}</span>
            <span className="tabular text-muted-foreground">
              {slice.value} · {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
