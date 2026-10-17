import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Reglas de agenda de las visitas comerciales (demostración de pulpa y
 * capacitación), según Dicampo: de lunes a viernes, de 9:00 a. m. a 4:00 p. m.
 * hora de Bogotá, de 20 a 30 minutos cada una. Las entregas de pedidos tienen
 * otro horario (lunes a sábado, 10 a. m. a 5 p. m.) y no pasan por aquí.
 *
 * Lógica pura, sin base de datos: la usan la disponibilidad que consulta el
 * agente y la validación al agendar.
 */
export const VISIT_RULES = {
  /** 1 = lunes … 5 = viernes (getDay de date-fns: 0 = domingo) */
  weekdays: [1, 2, 3, 4, 5] as readonly number[],
  /** Primera hora de inicio, en minutos desde la medianoche */
  startMinutes: 9 * 60,
  /** La visita debe terminar a esta hora */
  endMinutes: 16 * 60,
  /** Duración que se reserva por visita (Dicampo: 20–30 min) */
  durationMinutes: 30,
  /** Traslado entre una visita y la siguiente del mismo asesor */
  bufferMinutes: 30,
  /** Las franjas se ofrecen cada tantos minutos */
  slotStepMinutes: 30,
  /** Días de anticipación mínima: 1 = desde mañana */
  minLeadDays: 1,
  /** Hasta cuántos días adelante se puede agendar */
  maxDaysAhead: 30,
} as const;

const MINUTE = 60 * 1000;
const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type BogotaParts = { date: string; weekday: number; minutes: number };

/** Fecha (AAAA-MM-DD), día de la semana y minutos del día en Bogotá. */
export function bogotaParts(value: Date): BogotaParts {
  const local = new TZDate(value.getTime(), BUSINESS_TIME_ZONE);
  const date = [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, "0"),
    String(local.getDate()).padStart(2, "0"),
  ].join("-");
  return { date, weekday: local.getDay(), minutes: local.getHours() * 60 + local.getMinutes() };
}

/** Momento exacto de una hora de Bogotá en un día dado. */
export function bogotaMoment(date: string, minutes: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const local = new TZDate(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, BUSINESS_TIME_ZONE);
  return new Date(local.getTime());
}

/** Suma días de calendario a una fecha AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "2026-10-19T09:00:00-05:00": lo que el agente pasa tal cual a agendar_visita. */
export function toBogotaIso(value: Date): string {
  const { date, minutes } = bogotaParts(value);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00-05:00`;
}

/** "9:30 a. m." */
export function formatHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  const suffix = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** "lunes 19 de octubre" */
export function formatDayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${DAY_NAMES[weekdayOf(date)]} ${day} de ${MONTH_NAMES[month - 1]}`;
}

export const VISIT_HOURS_LABEL =
  `lunes a viernes, de ${formatHour(VISIT_RULES.startMinutes)} a ${formatHour(VISIT_RULES.endMinutes)} (hora de Bogotá)`;

/**
 * Por qué no se puede agendar una visita en ese momento, o `null` si cumple
 * las reglas (sin contar la agenda del asesor, que se revisa aparte).
 */
export function visitRuleViolation(when: Date, now: Date = new Date()): string | null {
  const { date, weekday, minutes } = bogotaParts(when);
  const today = bogotaParts(now).date;

  if (!VISIT_RULES.weekdays.includes(weekday)) {
    return `Las visitas son de ${VISIT_HOURS_LABEL}.`;
  }
  if (minutes < VISIT_RULES.startMinutes || minutes + VISIT_RULES.durationMinutes > VISIT_RULES.endMinutes) {
    return `Las visitas son de ${VISIT_HOURS_LABEL}; la última empieza a las ${formatHour(
      VISIT_RULES.endMinutes - VISIT_RULES.durationMinutes,
    )}.`;
  }
  if (date < addDays(today, VISIT_RULES.minLeadDays)) {
    return "Las visitas se agendan a partir del día hábil siguiente.";
  }
  if (date > addDays(today, VISIT_RULES.maxDaysAhead)) {
    return `Las visitas se agendan con máximo ${VISIT_RULES.maxDaysAhead} días de anticipación.`;
  }
  return null;
}

/** Choca con alguna visita del asesor (duración + traslado en ambos sentidos). */
export function conflictsWith(when: Date, busy: Date[]): boolean {
  const gap = (VISIT_RULES.durationMinutes + VISIT_RULES.bufferMinutes) * MINUTE;
  return busy.some((other) => Math.abs(other.getTime() - when.getTime()) < gap);
}

/** Próximos días hábiles para visitas, desde `from` (o el primero permitido). */
export function visitDays(count: number, from: string | undefined, now: Date = new Date()): string[] {
  const today = bogotaParts(now).date;
  const first = addDays(today, VISIT_RULES.minLeadDays);
  const last = addDays(today, VISIT_RULES.maxDaysAhead);
  let day = from && from > first ? from : first;
  const days: string[] = [];
  while (days.length < count && day <= last) {
    if (VISIT_RULES.weekdays.includes(weekdayOf(day))) days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/** Horas libres de un día, dadas las visitas que ya tiene el asesor. */
export function freeSlots(date: string, busy: Date[], now: Date = new Date()): Date[] {
  const slots: Date[] = [];
  for (
    let minutes = VISIT_RULES.startMinutes;
    minutes + VISIT_RULES.durationMinutes <= VISIT_RULES.endMinutes;
    minutes += VISIT_RULES.slotStepMinutes
  ) {
    const when = bogotaMoment(date, minutes);
    if (visitRuleViolation(when, now) === null && !conflictsWith(when, busy)) slots.push(when);
  }
  return slots;
}
