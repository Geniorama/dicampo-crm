import { z } from "zod";
import { LotStatus, StockMovementType } from "@/generated/prisma/enums";

/** Validación de lotes, ajustes de inventario y consultas de kardex. */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

export const lotCreateSchema = z.object({
  variantId: z.string().cuid(),
  /** Código de lote de producción, p. ej. "L-20260901-MAN" */
  lotCode: z.string().trim().min(2, "El código de lote es obligatorio").max(50),
  productionDate: z.coerce.date(),
  expiryDate: z.coerce.date(),
  quantity: z.coerce
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(1_000_000),
  notes: optionalText(1000),
});

export type LotFormValues = z.input<typeof lotCreateSchema>;
export type LotCreateInput = z.output<typeof lotCreateSchema>;

/**
 * Los tipos de movimiento que un operario puede registrar a mano. Las salidas
 * por venta y las devoluciones las genera el flujo de pedidos, no una persona.
 */
export const MANUAL_MOVEMENT_TYPES = [
  StockMovementType.AJUSTE,
  StockMovementType.MERMA,
] as const;

export const stockAdjustmentSchema = z
  .object({
    lotId: z.string().cuid(),
    type: z.enum(MANUAL_MOVEMENT_TYPES),
    /** Con signo: negativo descuenta, positivo corrige al alza. */
    quantity: z.coerce.number().refine((value) => value !== 0, {
      message: "La cantidad no puede ser cero.",
    }),
    reason: z.string().trim().min(3, "Explica el motivo del ajuste").max(500),
  })
  .refine((data) => data.type !== StockMovementType.MERMA || data.quantity < 0, {
    path: ["quantity"],
    message: "Una merma siempre descuenta: la cantidad debe ser negativa.",
  });

export type StockAdjustmentFormValues = z.input<typeof stockAdjustmentSchema>;
export type StockAdjustmentInput = z.output<typeof stockAdjustmentSchema>;

export const lotListQuerySchema = z.object({
  variantId: z.string().cuid().optional(),
  status: z.enum(LotStatus).optional(),
  /** Filtra los lotes con saldo que vencen dentro de N días. */
  expiringInDays: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type LotListQuery = z.infer<typeof lotListQuerySchema>;
