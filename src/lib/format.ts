import { format } from "date-fns";
import { es } from "date-fns/locale";

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

/** Fecha corta: "01 sep 2026" */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "dd MMM yyyy", { locale: es });
}

/** Fecha y hora: "01 sep 2026, 10:23" */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "dd MMM yyyy, HH:mm", { locale: es });
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
