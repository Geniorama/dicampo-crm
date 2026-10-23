/**
 * Catálogo y listas de precios de Dicampo, tomados de la hoja `Config` del
 * Excel comercial (precios por kilo, IVA incluido; la pulpa va excluida de
 * IVA, así que el precio es el mismo sin impuestos) y de la app de inventario
 * (rendimientos esperados, sabores y presentaciones).
 *
 * Es solo datos: lo lee `scripts/cargar-catalogo.ts` y lo prueba
 * `catalogo-dicampo.test.ts`.
 */

export type PriceTier = readonly [distribuidor: number, mayorista: number, publico: number];

export const PRICE_LIST_NAMES = ["Distribuidor", "Mayorista", "Público general"] as const;

/** Lista general existente: sus precios por defecto no se tocan. */
export const DEFAULT_LIST_NAME = "Lista General";

export type CatalogVariant = {
  presentation: "KILO" | "LIBRA" | "MEDIO_LITRO" | "LITRO" | "TRES_LITROS";
  sku: string;
  /** Precios por nivel; sin ellos, la variante se crea sin precio. */
  tiers?: PriceTier;
};

export type CatalogProduct = {
  /** Sabor, que es la identidad del producto (único en el CRM). */
  flavor: string;
  name: string;
  category: "PULPA" | "LIMONADA" | "MEZCLA" | "ZUMO";
  baseFruit?: string;
  /** Rendimiento esperado al despulpar, de la app de inventario. */
  expectedYieldPct?: number;
  variants: CatalogVariant[];
};

const kilo = (sku: string, tiers?: PriceTier): CatalogVariant => ({ presentation: "KILO", sku, tiers });

export const CATALOG: CatalogProduct[] = [
  // ── Pulpas ────────────────────────────────────────────────
  { flavor: "Mango", name: "Pulpa de Mango", category: "PULPA", expectedYieldPct: 60, variants: [kilo("MAN-K", [13260, 15450, 16450]), { presentation: "LIBRA", sku: "MAN-L" }] },
  { flavor: "Fresa", name: "Pulpa de Fresa", category: "PULPA", expectedYieldPct: 62, variants: [kilo("FRE-K", [12760, 14950, 15950]), { presentation: "LIBRA", sku: "FRE-L" }] },
  { flavor: "Lulo", name: "Pulpa de Lulo", category: "PULPA", variants: [kilo("LUL-K", [13200, 14950, 15950]), { presentation: "LIBRA", sku: "LUL-L" }] },
  { flavor: "Mora", name: "Pulpa de Mora", category: "PULPA", expectedYieldPct: 65, variants: [kilo("MOR-K", [13200, 14950, 15950]), { presentation: "LIBRA", sku: "MOR-L" }] },
  { flavor: "Guanábana", name: "Pulpa de Guanábana", category: "PULPA", variants: [kilo("GUA-K", [14850, 17700, 18700]), { presentation: "LIBRA", sku: "GUA-L" }] },
  { flavor: "Maracuyá", name: "Pulpa de Maracuyá", category: "PULPA", expectedYieldPct: 34, variants: [kilo("MAR-K", [20350, 22100, 23100]), { presentation: "LIBRA", sku: "MAR-L" }] },
  { flavor: "Mandarina", name: "Pulpa de Mandarina", category: "PULPA", variants: [kilo("MND-K", [19250, 21000, 22000])] },
  { flavor: "Uva", name: "Pulpa de Uva", category: "PULPA", variants: [kilo("UVA-K", [11500, 13000, 14000])] },
  { flavor: "Piña", name: "Pulpa de Piña", category: "PULPA", variants: [kilo("PIN-K", [13750, 14950, 15950]), { presentation: "LIBRA", sku: "PIN-L" }] },
  { flavor: "Naranja", name: "Pulpa de Naranja", category: "PULPA", variants: [kilo("NAR-K", [15000, 17000, 18000])] },

  // Productos aparte del histórico comercial: solo se cotizaron a Super distribuidor,
  // así que no hay tarifa por nivel (los precios van en la lista de ese cliente).
  { flavor: "Maracuyá Semilla", name: "Pulpa de Maracuyá con Semilla", category: "PULPA", variants: [kilo("MSE-K")] },
  { flavor: "Mora Despitonada", name: "Pulpa de Mora Despitonada", category: "PULPA", variants: [kilo("MDE-K")] },

  // ── Mezclas ───────────────────────────────────────────────
  { flavor: "Frutos Rojos", name: "Mezcla de Frutos Rojos", category: "MEZCLA", variants: [kilo("FRO-K", [14800, 15500, 16500])] },
  { flavor: "Frutos Amarillos", name: "Mezcla de Frutos Amarillos", category: "MEZCLA", variants: [kilo("FAM-K", [15675, 17150, 18150])] },
  { flavor: "Piña Colada", name: "Mezcla de Piña Colada", category: "MEZCLA", variants: [kilo("PCO-K", [20350, 22100, 23100])] },
  // El Excel solo registra una venta suelta a $25.000 por unidad; sin tarifa por nivel.
  { flavor: "Mix Pulpas", name: "Mix de Pulpas", category: "MEZCLA", variants: [kilo("MIX-K")] },

  // ── Limonadas ─────────────────────────────────────────────
  { flavor: "Limonada", name: "Base para Limonada Natural", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LIM-K", [13200, 14400, 15400])] },
  { flavor: "Limón Hierbabuena", name: "Limonada de Hierbabuena", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LHB-K", [18480, 19900, 20900])] },
  { flavor: "Limón Cereza", name: "Limonada de Cereza", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LCE-K", [18480, 19900, 20900])] },
  { flavor: "Limón Mango Biche", name: "Limonada de Mango Biche", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LMB-K", [18480, 19900, 20900])] },
  { flavor: "Limón Coco", name: "Limonada de Coco", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LCO-K", [26400, 27600, 28600])] },
  { flavor: "Limonada Panelada", name: "Limonada Panelada", category: "LIMONADA", baseFruit: "Limón", variants: [kilo("LPN-K", [14950, 16000, 17000])] },

  // ── Zumos (se venden por litros; mismo precio para todos los niveles) ──
  {
    flavor: "Zumo de Naranja",
    name: "Zumo de Naranja",
    category: "ZUMO",
    baseFruit: "Naranja",
    variants: [
      { presentation: "LITRO", sku: "ZNA-1L", tiers: [8000, 8000, 8000] },
      { presentation: "TRES_LITROS", sku: "ZNA-3L", tiers: [24000, 24000, 24000] },
    ],
  },
  {
    flavor: "Zumo de Limón",
    name: "Zumo de Limón",
    category: "ZUMO",
    baseFruit: "Limón",
    variants: [
      { presentation: "MEDIO_LITRO", sku: "ZLI-500ML", tiers: [9000, 9000, 9000] },
      { presentation: "LITRO", sku: "ZLI-1L", tiers: [18000, 18000, 18000] },
    ],
  },
  // El histórico solo registra 2 ventas a $11.000 el litro (Público general): se asume el mismo precio en todos los niveles, como los demás zumos.
  {
    flavor: "Zumo de Mandarina",
    name: "Zumo de Mandarina",
    category: "ZUMO",
    baseFruit: "Mandarina",
    variants: [{ presentation: "LITRO", sku: "ZMN-1L", tiers: [11000, 11000, 11000] }],
  },
];

/**
 * Los "Bloques de pulpa x 500 g" de la app de inventario son la presentación
 * Libra (500 g) de estos sabores; este catálogo la crea en cada uno. Sus
 * precios por nivel no están en la hoja Config.
 */
export const BLOCK_500G_FLAVORS = ["Mango", "Fresa", "Lulo", "Mora", "Guanábana", "Maracuyá", "Piña"] as const;
