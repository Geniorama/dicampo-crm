import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { BUSINESS_TIME_ZONE } from "@/lib/format";

/** Validación de los filtros de reportes. */

/** Períodos predefinidos; cubren el 90 % de las consultas del día a día. */
export const PERIOD_PRESETS = {
  ESTE_MES: "Este mes",
  MES_ANTERIOR: "Mes anterior",
  ULTIMOS_30: "Últimos 30 días",
  ULTIMOS_90: "Últimos 90 días",
  ESTE_ANIO: "Este año",
  PERSONALIZADO: "Personalizado",
} as const;

export type PeriodPreset = keyof typeof PERIOD_PRESETS;

/**
 * Fecha de un `<input type="date">`, que siempre envía "AAAA-MM-DD".
 *
 * NO se usa `z.coerce.date()`: ese constructor interpreta la cadena como
 * medianoche **UTC**, y al leerla luego con los métodos locales en Bogotá
 * (UTC−5) retrocede un día — el rango terminaría la víspera y dejaría fuera
 * las ventas de la última jornada. Aquí se construye la fecha en local.
 */
export const localDateSchema = z.union([
  z.date(),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha no válido")
    .transform((value): Date => {
      const [year, month, day] = value.split("-").map(Number);
      // Medianoche en Bogotá, no en la zona del servidor (UTC en Netlify).
      return new Date(new TZDate(year, month - 1, day, BUSINESS_TIME_ZONE).getTime());
    }),
]);

export const reportQuerySchema = z
  .object({
    period: z.enum(Object.keys(PERIOD_PRESETS) as [PeriodPreset, ...PeriodPreset[]])
      .default("ESTE_MES"),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    sellerId: z.string().cuid().optional(),
    /** Días sin comprar para el reporte de recompra. */
    inactiveDays: z.coerce.number().int().min(7).max(365).default(30),
  })
  .transform((data) => ({ ...data, ...resolveRange(data) }));

export type ReportQuery = z.output<typeof reportQuerySchema>;

/**
 * Traduce el período elegido a un rango concreto.
 *
 * Se resuelve en el servidor, no en el navegador: el reporte tiene que salir
 * igual sin importar la zona horaria del computador de quien lo consulta.
 */
function resolveRange(data: {
  period: PeriodPreset;
  from?: Date;
  to?: Date;
}): { rangeFrom: Date; rangeTo: Date } {
  // Los "hoy", "este mes" y "este año" son los de Bogotá: con la zona del
  // servidor (UTC) un pedido de las 8 p. m. del 31 caía en el mes siguiente.
  const now = TZDate.tz(BUSINESS_TIME_ZONE);
  const day = (
    year: number,
    month: number,
    date: number,
    hours = 0,
    minutes = 0,
    seconds = 0,
    ms = 0,
  ): Date =>
    new Date(new TZDate(year, month, date, hours, minutes, seconds, ms, BUSINESS_TIME_ZONE).getTime());
  const startOfToday = day(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (data.period) {
    case "MES_ANTERIOR":
      return {
        rangeFrom: day(now.getFullYear(), now.getMonth() - 1, 1),
        rangeTo: day(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "ULTIMOS_30":
      return {
        rangeFrom: new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000),
        rangeTo: endOfToday,
      };
    case "ULTIMOS_90":
      return {
        rangeFrom: new Date(startOfToday.getTime() - 89 * 24 * 60 * 60 * 1000),
        rangeTo: endOfToday,
      };
    case "ESTE_ANIO":
      return {
        rangeFrom: day(now.getFullYear(), 0, 1),
        rangeTo: endOfToday,
      };
    case "PERSONALIZADO":
      return {
        rangeFrom: data.from ?? day(now.getFullYear(), now.getMonth(), 1),
        // Se incluye el día completo del extremo superior.
        rangeTo: data.to
          ? endOfBusinessDay(data.to)
          : endOfToday,
      };
    case "ESTE_MES":
    default:
      return {
        rangeFrom: day(now.getFullYear(), now.getMonth(), 1),
        rangeTo: endOfToday,
      };
  }
}

/** Reportes que se pueden descargar como CSV. */
export const EXPORT_TYPES = [
  "ventas",
  "productos",
  "vendedores",
  "recompra",
  "inventario",
] as const;

export const exportQuerySchema = z.object({
  tipo: z.enum(EXPORT_TYPES),
});

/** Hojas que puede incluir el libro de Excel. */
export const WORKBOOK_SHEETS = {
  evolucion: "Evolución de ventas",
  productos: "Ventas por producto",
  vendedores: "Ventas por vendedor",
  recompra: "Clientes sin comprar",
  rotacion: "Rotación de inventario",
  pedidos: "Pedidos detallados",
  lineas: "Líneas de pedido",
  kardex: "Kardex de inventario",
  clientes: "Directorio de clientes",
} as const;

export type WorkbookSheet = keyof typeof WORKBOOK_SHEETS;

const ALL_SHEETS = Object.keys(WORKBOOK_SHEETS) as WorkbookSheet[];

/**
 * Hojas pedidas. Llegan repetidas en la URL (?hojas=a&hojas=b) porque es lo
 * que envía un formulario con casillas; si no viene ninguna se incluyen todas.
 */
export const workbookQuerySchema = z.object({
  hojas: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return ALL_SHEETS;
      const requested = Array.isArray(value) ? value : value.split(",");
      // Una lista vacía llega cuando no se marcó ninguna casilla.
      if (requested.length === 0) return ALL_SHEETS;
      const valid = requested.filter((name): name is WorkbookSheet =>
        ALL_SHEETS.includes(name as WorkbookSheet),
      );
      return valid.length > 0 ? valid : ALL_SHEETS;
    }),
});

/** Último milisegundo del día de `date` en Bogotá. */
export function endOfBusinessDay(date: Date): Date {
  const local = new TZDate(date, BUSINESS_TIME_ZONE);
  return new Date(
    new TZDate(
      local.getFullYear(),
      local.getMonth(),
      local.getDate(),
      23,
      59,
      59,
      999,
      BUSINESS_TIME_ZONE,
    ).getTime(),
  );
}

/**
 * Fecha compromiso: "AAAA-MM-DD" de un `<input type="date">` se toma como el
 * inicio de ese día en Bogotá (así se muestra en el día correcto); una fecha
 * con hora se respeta tal cual.
 */
export const businessDateSchema = z.union([
  z.date(),
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .transform((value): Date => {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(new TZDate(year, month - 1, day, BUSINESS_TIME_ZONE).getTime());
    }),
  z.coerce.date(),
]);
