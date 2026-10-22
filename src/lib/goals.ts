import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "./format";

/**
 * Metas mensuales: ventas en pesos y clientes nuevos.
 *
 * Pura y sin base de datos. Los meses se manejan como "AAAA-MM" y los límites
 * se calculan en hora de Bogotá: un pedido de las 8 p. m. del 31 cuenta en
 * ese mes, no en el siguiente.
 */

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function currentMonth(now: Date = new Date()): string {
  const local = new TZDate(now, BUSINESS_TIME_ZONE);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}`;
}

/** Primer instante del mes y primero del siguiente (rango semiabierto). */
export function monthBounds(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    start: new Date(new TZDate(year, monthNumber - 1, 1, 0, 0, 0, 0, BUSINESS_TIME_ZONE)),
    end: new Date(new TZDate(year, monthNumber, 1, 0, 0, 0, 0, BUSINESS_TIME_ZONE)),
  };
}

export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

/**
 * Qué parte del mes ya pasó (0 a 1). Un mes futuro no ha empezado y uno
 * pasado está completo. Cuenta el día en curso como transcurrido.
 */
export function elapsedFraction(month: string, now: Date = new Date()): number {
  const current = currentMonth(now);
  if (month > current) return 0;
  if (month < current) return 1;

  const day = new TZDate(now, BUSINESS_TIME_ZONE).getDate();
  return day / daysInMonth(month);
}

export type GoalPace = "ADELANTADO" | "EN_RITMO" | "ATRASADO" | "CUMPLIDA" | "SIN_META";

export type GoalProgress = {
  target: number;
  achieved: number;
  /** Porcentaje logrado; null sin meta. Puede pasar de 100. */
  percent: number | null;
  /** Lo que debería llevar a hoy si el ritmo fuera parejo. */
  expected: number;
  pace: GoalPace;
};

/** Margen, en puntos porcentuales, para considerar que va "en ritmo". */
const PACE_TOLERANCE = 10;

export function goalProgress(target: number, achieved: number, elapsed: number): GoalProgress {
  if (target <= 0) {
    return { target: 0, achieved, percent: null, expected: 0, pace: "SIN_META" };
  }

  const percent = (achieved / target) * 100;
  const expected = target * elapsed;

  let pace: GoalPace;
  if (achieved >= target) pace = "CUMPLIDA";
  else if (percent >= elapsed * 100 + PACE_TOLERANCE) pace = "ADELANTADO";
  else if (percent >= elapsed * 100 - PACE_TOLERANCE) pace = "EN_RITMO";
  else pace = "ATRASADO";

  return { target, achieved, percent, expected, pace };
}
