/**
 * Tiempos de un recorrido a partir de las marcas que deja el repartidor:
 * la salida de la ruta, la llegada a cada parada y el momento en que la
 * cierra (entrega o intento fallido).
 *
 * - **Trayecto** de una parada: desde que se salió de la anterior (o de
 *   bodega, en la primera) hasta que se llegó.
 * - **En sitio**: desde que se llegó hasta que se cerró la parada.
 *
 * Funciones puras y en milisegundos: la pantalla las formatea.
 */

export type StopMarks = {
  id: string;
  arrivedAt: Date | null;
  /** Cuando la parada se cerró: entrega registrada o intento fallido. */
  closedAt: Date | null;
};

export type StopTiming = {
  id: string;
  travelMs: number | null;
  onSiteMs: number | null;
};

export type RouteTiming = {
  stops: StopTiming[];
  travelMs: number;
  onSiteMs: number;
  /** De la salida al último cierre (o a `now` si la ruta sigue abierta). */
  totalMs: number | null;
};

function span(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  // Un reloj desfasado no debe producir tiempos negativos.
  return ms < 0 ? null : ms;
}

/** Las paradas deben venir en el orden de visita. */
export function computeRouteTiming(
  startedAt: Date | null,
  stops: readonly StopMarks[],
  now: Date = new Date(),
): RouteTiming {
  let previousClose: Date | null = startedAt;
  let travelMs = 0;
  let onSiteMs = 0;

  const timings = stops.map((stop): StopTiming => {
    const travel = span(previousClose, stop.arrivedAt);
    const onSite = span(stop.arrivedAt, stop.closedAt);
    if (travel !== null) travelMs += travel;
    if (onSite !== null) onSiteMs += onSite;
    if (stop.closedAt) previousClose = stop.closedAt;
    return { id: stop.id, travelMs: travel, onSiteMs: onSite };
  });

  const lastClose = stops.reduce<Date | null>(
    (latest, stop) =>
      stop.closedAt && (!latest || stop.closedAt > latest) ? stop.closedAt : latest,
    null,
  );
  const allClosed = stops.length > 0 && stops.every((stop) => stop.closedAt);

  return {
    stops: timings,
    travelMs,
    onSiteMs,
    totalMs: span(startedAt, allClosed ? lastClose : now),
  };
}

/** 5400000 → "1 h 30 min"; menos de un minuto → "< 1 min". */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "< 1 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
