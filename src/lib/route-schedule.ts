/**
 * Rutas recurrentes: aritmética de fechas, sin base de datos.
 *
 * Todo son fechas de calendario "AAAA-MM-DD" (la ruta se guarda a medianoche
 * UTC, ver `formatCalendarDate`) y el día de la semana es ISO: 1 = lunes … 7 = domingo.
 */

/** Cuántos días hacia adelante se tienen generadas las rutas programadas. */
export const SCHEDULE_HORIZON_DAYS = 14;

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
};

/** Día ISO de la semana de una fecha de calendario. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Fechas en que cae `weekday` entre `from` y `from + horizonDays`, ambas
 * incluidas, sin pasar por debajo de `startsOn`.
 */
export function scheduledDates(
  weekday: number,
  startsOn: string,
  from: string,
  horizonDays: number = SCHEDULE_HORIZON_DAYS,
): string[] {
  const first = startsOn > from ? startsOn : from;
  const last = addDays(from, horizonDays);
  const dates: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    if (isoWeekday(day) === weekday) dates.push(day);
  }
  return dates;
}
