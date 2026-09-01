import { z } from "zod";
import { Presentation, ProductCategory } from "@/generated/prisma/enums";

/**
 * Validación del catálogo: productos (sabores), variantes (unidad vendible)
 * y listas de precios.
 */

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional();

/** Peso neto por presentación; el negocio no admite otros valores. */
export const NET_WEIGHT_G: Record<Presentation, number> = {
  KILO: 1000,
  LIBRA: 500,
};

export const productCreateSchema = z.object({
  name: z.string().trim().min(3, "El nombre es obligatorio").max(150),
  flavor: z.string().trim().min(2, "El sabor es obligatorio").max(100),
  category: z.enum(ProductCategory).default(ProductCategory.PULPA),
  description: optionalText(1000),
  /**
   * Tarifa de IVA como fracción (0.19 = 19%). Por defecto 0: la pulpa de
   * fruta tiene tratamiento especial en Colombia.
   */
  taxRate: z.coerce.number().min(0).max(1).default(0),
  active: z.boolean().default(true),

  /**
   * Primera presentación con su precio.
   *
   * Va aquí, y no en un segundo paso, porque un producto sin ninguna variante
   * no se puede vender: quedaría a medio crear. Es opcional para no romper a
   * quien llame a la API solo para registrar el sabor.
   */
  firstPresentation: z.enum(Presentation).optional(),
  firstPrice: z.coerce.number().min(0, "El precio no puede ser negativo").optional(),
});

export type ProductFormValues = z.input<typeof productCreateSchema>;
export type ProductCreateInput = z.output<typeof productCreateSchema>;

export const productUpdateSchema = productCreateSchema
  .omit({ firstPresentation: true, firstPrice: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No se envió ningún campo para actualizar.",
  });

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const variantCreateSchema = z.object({
  presentation: z.enum(Presentation),
  /** Si no se envía, se deriva de la presentación. */
  sku: optionalText(40),
  active: z.boolean().default(true),
  /** Precio en la lista por defecto; opcional al crear la variante. */
  price: z.coerce.number().min(0, "El precio no puede ser negativo").optional(),
});

export type VariantFormValues = z.input<typeof variantCreateSchema>;
export type VariantCreateInput = z.output<typeof variantCreateSchema>;

export const variantUpdateSchema = z.object({
  sku: optionalText(40),
  active: z.boolean().optional(),
});

export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

export const productListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.enum(ProductCategory).optional(),
  /** "1" muestra también los productos desactivados. */
  includeInactive: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
  priceListId: z.string().cuid().optional(),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

// ── Listas de precios ────────────────────────────────────────

export const priceListCreateSchema = z.object({
  name: z.string().trim().min(3, "El nombre es obligatorio").max(100),
  isDefault: z.boolean().default(false),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  active: z.boolean().default(true),
});

export type PriceListCreateInput = z.output<typeof priceListCreateSchema>;

/** Actualiza precios en bloque: es como se ajusta una lista en la práctica. */
export const priceBulkUpdateSchema = z.object({
  priceListId: z.string().cuid(),
  items: z
    .array(
      z.object({
        variantId: z.string().cuid(),
        price: z.coerce.number().min(0, "El precio no puede ser negativo"),
        minQty: z.coerce.number().min(0.001).default(1),
      }),
    )
    .min(1, "Envía al menos un precio."),
});

export type PriceBulkUpdateInput = z.infer<typeof priceBulkUpdateSchema>;
