import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Reglas de agenda de las visitas comerciales (demostración de pulpa y
 * capacitación), según Dicampo: de lunes a viernes, de 9:00 a. m. a 4:00 p. m.
 * hora de Bogotá, de 20 a 30 minutos cada una. Las entregas de pedidos tienen
 * otro horario (lunes a sábado, 10 a. m. a 5 p. m.) y no pasan por aquí.
 *
 * Ese es el horario **por defecto**. Cada asesor puede configurar el suyo
 * (franjas por día, duración, traslado, anticipación, horizonte y ausencias)
 * desde /agenda/disponibilidad; las funciones de aquí reciben esa política
 * como `VisitPolicy` y, si no se pasa, usan la general.
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

/**
 * Horario de visitas de un asesor. Los días van con la numeración de
 * `getDay` (0 = domingo … 6 = sábado).
 */
export type VisitPolicy = {
  windows: readonly { weekday: number; startMinutes: number; endMinutes: number }[];
  durationMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  minLeadDays: number;
  maxDaysAhead: number;
  /** Ausencias del asesor: no se ofrece ni se acepta nada que las toque. */
  blocks: readonly { startsAt: Date; endsAt: Date }[];
};

/** El horario general, para quien no ha configurado el suyo. */
export const DEFAULT_VISIT_POLICY: VisitPolicy = {
  windows: VISIT_RULES.weekdays.map((weekday) => ({
    weekday,
    startMinutes: VISIT_RULES.startMinutes,
    endMinutes: VISIT_RULES.endMinutes,
  })),
  durationMinutes: VISIT_RULES.durationMinutes,
  bufferMinutes: VISIT_RULES.bufferMinutes,
  slotStepMinutes: VISIT_RULES.slotStepMinutes,
  minLeadDays: VISIT_RULES.minLeadDays,
  maxDaysAhead: VISIT_RULES.maxDaysAhead,
  blocks: [],
};

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

/** Une "lunes", "martes", "miércoles" en "lunes a miércoles" si son seguidos. */
function describeDays(weekdays: number[]): string {
  // Orden de lunes a domingo.
  const order = (day: number) => (day === 0 ? 7 : day);
  const sorted = [...weekdays].sort((a, b) => order(a) - order(b));
  const consecutive = sorted.every(
    (day, index) => index === 0 || order(day) === order(sorted[index - 1]) + 1,
  );
  const names = sorted.map((day) => DAY_NAMES[day]);

  if (consecutive && names.length >= 3) return `${names[0]} a ${names.at(-1)}`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

/**
 * El horario en palabras, para que el agente se lo diga al cliente:
 * "lunes a viernes, de 9:00 a. m. a 4:00 p. m. (hora de Bogotá)". Agrupa los
 * días que tienen exactamente las mismas franjas.
 */
export function describeVisitHours(policy: VisitPolicy = DEFAULT_VISIT_POLICY): string {
  if (policy.windows.length === 0) return "sin horario de visitas configurado";

  const groups = new Map<string, number[]>();
  for (let weekday = 0; weekday < 7; weekday++) {
    const ranges = policy.windows
      .filter((window) => window.weekday === weekday)
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((window) => `de ${formatHour(window.startMinutes)} a ${formatHour(window.endMinutes)}`);
    if (ranges.length === 0) continue;
    const key = ranges.join(" y ");
    groups.set(key, [...(groups.get(key) ?? []), weekday]);
  }

  const parts = [...groups.entries()].map(([ranges, days]) => `${describeDays(days)}, ${ranges}`);
  return `${parts.join("; ")} (hora de Bogotá)`;
}

export const VISIT_HOURS_LABEL = describeVisitHours(DEFAULT_VISIT_POLICY);

/** Hay una franja del día en la que cabe entera una visita que empieza a esa hora. */
function fitsWindow(policy: VisitPolicy, weekday: number, minutes: number): boolean {
  return policy.windows.some(
    (window) =>
      window.weekday === weekday &&
      minutes >= window.startMinutes &&
      minutes + policy.durationMinutes <= window.endMinutes,
  );
}

/** Choca con una ausencia del asesor. */
function blockedBy(policy: VisitPolicy, when: Date): boolean {
  const start = when.getTime();
  const end = start + policy.durationMinutes * MINUTE;
  return policy.blocks.some(
    (block) => start < block.endsAt.getTime() && block.startsAt.getTime() < end,
  );
}

/**
 * Por qué no se puede agendar una visita en ese momento, o `null` si cumple
 * las reglas (sin contar las visitas que ya tiene el asesor, que se revisan
 * aparte con `conflictsWith`).
 */
export function visitRuleViolation(
  when: Date,
  now: Date = new Date(),
  policy: VisitPolicy = DEFAULT_VISIT_POLICY,
): string | null {
  const { date, weekday, minutes } = bogotaParts(when);
  const today = bogotaParts(now).date;
  const hours = describeVisitHours(policy);

  if (!policy.windows.some((window) => window.weekday === weekday)) {
    return `Las visitas son de ${hours}.`;
  }
  if (!fitsWindow(policy, weekday, minutes)) {
    const lastStarts = policy.windows
      .filter((window) => window.weekday === weekday)
      .map((window) => window.endMinutes - policy.durationMinutes);
    return `Las visitas son de ${hours}; la última empieza a las ${formatHour(Math.max(...lastStarts))}.`;
  }
  if (date < addDays(today, policy.minLeadDays)) {
    return policy.minLeadDays === 1
      ? "Las visitas se agendan a partir del día hábil siguiente."
      : `Las visitas se agendan con al menos ${policy.minLeadDays} días de anticipación.`;
  }
  // Con anticipación 0 se puede agendar hoy, pero no a una hora que ya pasó.
  if (when.getTime() <= now.getTime()) {
    return "Esa hora ya pasó.";
  }
  if (date > addDays(today, policy.maxDaysAhead)) {
    return `Las visitas se agendan con máximo ${policy.maxDaysAhead} días de anticipación.`;
  }
  if (blockedBy(policy, when)) {
    return "El asesor no está disponible a esa hora.";
  }
  return null;
}

/** Choca con alguna visita del asesor (duración + traslado en ambos sentidos). */
export function conflictsWith(
  when: Date,
  busy: Date[],
  policy: VisitPolicy = DEFAULT_VISIT_POLICY,
): boolean {
  const gap = (policy.durationMinutes + policy.bufferMinutes) * MINUTE;
  return busy.some((other) => Math.abs(other.getTime() - when.getTime()) < gap);
}

/** Próximos días con horario de visitas, desde `from` (o el primero permitido). */
export function visitDays(
  count: number,
  from: string | undefined,
  now: Date = new Date(),
  policy: VisitPolicy = DEFAULT_VISIT_POLICY,
): string[] {
  const today = bogotaParts(now).date;
  const first = addDays(today, policy.minLeadDays);
  const last = addDays(today, policy.maxDaysAhead);
  const weekdays = new Set(policy.windows.map((window) => window.weekday));
  let day = from && from > first ? from : first;
  const days: string[] = [];
  while (days.length < count && day <= last) {
    if (weekdays.has(weekdayOf(day))) days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/** Horas libres de un día, dadas las visitas que ya tiene el asesor. */
export function freeSlots(
  date: string,
  busy: Date[],
  now: Date = new Date(),
  policy: VisitPolicy = DEFAULT_VISIT_POLICY,
): Date[] {
  const weekday = weekdayOf(date);
  const slots: Date[] = [];
  const windows = policy.windows
    .filter((window) => window.weekday === weekday)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  for (const window of windows) {
    for (
      let minutes = window.startMinutes;
      minutes + policy.durationMinutes <= window.endMinutes;
      minutes += policy.slotStepMinutes
    ) {
      const when = bogotaMoment(date, minutes);
      if (visitRuleViolation(when, now, policy) === null && !conflictsWith(when, busy, policy)) {
        slots.push(when);
      }
    }
  }
  return slots;
}

// ── Configuración por asesor ─────────────────────────────────

/** Franja tal como se guarda: día ISO (1 = lunes … 7 = domingo). */
export type StoredWindow = { weekday: number; startMinute: number; endMinute: number };

/**
 * Política de un asesor a partir de lo guardado en `AdvisorSchedule`. Sin
 * configuración —o sin ninguna franja— usa el horario general: un asesor
 * nuevo sigue recibiendo visitas como hasta ahora.
 */
export function policyFromSchedule(
  schedule:
    | {
        visitMinutes: number;
        bufferMinutes: number;
        minLeadDays: number;
        maxDaysAhead: number;
        windows: StoredWindow[];
      }
    | null
    | undefined,
  blocks: readonly { startsAt: Date; endsAt: Date }[] = [],
): VisitPolicy {
  if (!schedule || schedule.windows.length === 0) {
    return { ...DEFAULT_VISIT_POLICY, blocks };
  }
  return {
    windows: schedule.windows.map((window) => ({
      weekday: window.weekday % 7,
      startMinutes: window.startMinute,
      endMinutes: window.endMinute,
    })),
    durationMinutes: schedule.visitMinutes,
    bufferMinutes: schedule.bufferMinutes,
    slotStepMinutes: VISIT_RULES.slotStepMinutes,
    minLeadDays: schedule.minLeadDays,
    maxDaysAhead: schedule.maxDaysAhead,
    blocks,
  };
}

/** Franjas del mismo día que se pisan (las contiguas no cuentan). */
export function findOverlappingWindows(windows: StoredWindow[]): StoredWindow[] {
  const overlapping = new Set<StoredWindow>();
  for (let weekday = 1; weekday <= 7; weekday++) {
    const sameDay = windows
      .filter((window) => window.weekday === weekday)
      .sort((a, b) => a.startMinute - b.startMinute);
    for (let index = 1; index < sameDay.length; index++) {
      if (sameDay[index].startMinute < sameDay[index - 1].endMinute) {
        overlapping.add(sameDay[index - 1]);
        overlapping.add(sameDay[index]);
      }
    }
  }
  return windows.filter((window) => overlapping.has(window));
}

/** 540 → "09:00", para los `<input type="time">`. */
export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "09:00" → 540; `NaN` si no es una hora válida. Admite "24:00". */
export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return Number.NaN;
  return hours * 60 + minutes;
}

/** "AAAA-MM-DD" de hoy en Bogotá. */
export function todayInBogota(now: Date = new Date()): string {
  return bogotaParts(now).date;
}
