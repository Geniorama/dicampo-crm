import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TZDate } from "@date-fns/tz";

/**
 * Zona horaria de la operación. El servidor (Netlify) corre en UTC y el
 * navegador en la zona de cada quien: formatear sin zona explícita mostraba
 * las horas cinco horas corridas en producción.
 */
export const BUSINESS_TIME_ZONE = "America/Bogota";

/**
 * Formateadores para la operación colombiana.
 *
 * Prisma devuelve las columnas `Decimal` como objetos, no como números, así
 * que estas funciones aceptan cualquier valor con `toString()` y lo normalizan.
 */

export type Numeric = number | string | { toString(): string };

export function toNumber(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  // En Colombia los precios se manejan sin centavos.
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formatea un monto en pesos colombianos: 12000 → "$ 12.000" */
export function formatCOP(value: Numeric | null | undefined): string {
  return copFormatter.format(toNumber(value));
}

const quantityFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** Formatea una cantidad de inventario, ocultando decimales innecesarios. */
export function formatQuantity(value: Numeric | null | undefined): string {
  return quantityFormatter.format(toNumber(value));
}

/**
 * Fecha corta de un **momento** (creación, pedido, actividad), en hora de
 * Bogotá: "01 sep 2026". Para fechas de calendario usa `formatCalendarDate`.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return format(new TZDate(new Date(value), BUSINESS_TIME_ZONE), "dd MMM yyyy", { locale: es });
}

/** Fecha y hora de un momento, en hora de Bogotá: "01 sep 2026, 10:23" */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return format(new TZDate(new Date(value), BUSINESS_TIME_ZONE), "dd MMM yyyy, HH:mm", {
    locale: es,
  });
}

/**
 * Fecha **de calendario**, sin hora: vencimiento de un lote, entrega pedida,
 * fecha de ruta, cierre esperado. Un `<input type="date">` llega como
 * "AAAA-MM-DD" y se guarda a medianoche UTC; leerla en hora de Bogotá la
 * mostraría el día anterior, así que se lee en UTC.
 */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return format(new TZDate(new Date(value), "UTC"), "dd MMM yyyy", { locale: es });
}

/** Consecutivo de pedido legible: 123 → "PED-000123" */
export function formatOrderNumber(orderNumber: number): string {
  return `PED-${String(orderNumber).padStart(6, "0")}`;
}

/** Código de cliente legible: 42 → "CLI-0042" */
export function formatClientCode(sequence: number): string {
  return `CLI-${String(sequence).padStart(4, "0")}`;
}

/** Muestra el NIT con su dígito de verificación: "900123456-7" */
export function formatNit(
  nit: string | null | undefined,
  dv: string | null | undefined,
): string {
  if (!nit) return "—";
  const grouped = new Intl.NumberFormat("es-CO").format(Number(nit));
  const digits = Number.isNaN(Number(nit)) ? nit : grouped;
  return dv ? `${digits}-${dv}` : digits;
}

const bogotaDateTime = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const bogotaTime = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
});

const bogotaDay = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Fecha y hora **en Bogotá**, sin depender de la zona del servidor (Netlify
 * corre en UTC). Para mensajes de chat, donde cinco horas de diferencia
 * confunden.
 */
export function formatBogotaDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return bogotaDateTime.format(typeof value === "string" ? new Date(value) : value);
}

/** Solo la hora en Bogotá: "10:23 a. m." */
export function formatBogotaTime(value: Date | string): string {
  return bogotaTime.format(typeof value === "string" ? new Date(value) : value);
}

/** Día completo en Bogotá, para separar el chat por fechas. */
export function formatBogotaDay(value: Date | string): string {
  return bogotaDay.format(typeof value === "string" ? new Date(value) : value);
}
