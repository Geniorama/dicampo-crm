import { z } from "zod";

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
    .transform((value) => {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day);
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
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (data.period) {
    case "MES_ANTERIOR":
      return {
        rangeFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        rangeTo: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
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
        rangeFrom: new Date(now.getFullYear(), 0, 1),
        rangeTo: endOfToday,
      };
    case "PERSONALIZADO":
      return {
        rangeFrom: data.from ?? new Date(now.getFullYear(), now.getMonth(), 1),
        // Se incluye el día completo del extremo superior.
        rangeTo: data.to
          ? new Date(data.to.getFullYear(), data.to.getMonth(), data.to.getDate(), 23, 59, 59, 999)
          : endOfToday,
      };
    case "ESTE_MES":
    default:
      return {
        rangeFrom: new Date(now.getFullYear(), now.getMonth(), 1),
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
