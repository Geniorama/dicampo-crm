import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ProductCategory,
  Presentation,
  UserRole,
} from "../src/generated/prisma/enums";

/**
 * Datos maestros del CRM: zonas de reparto, catálogo de sabores, lista de
 * precios por defecto y usuario administrador.
 *
 * Es idempotente (todo por `upsert`), así que puede ejecutarse varias veces
 * sin duplicar. No crea clientes ni pedidos de ejemplo: está pensado para
 * poder correrse también contra producción.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────────
// Precios base
//
// En la app actual (dicampo-app-pedidos) el precio se compone como
//   precio final = precio base de la presentación + recargo del sabor
// El recargo por sabor está abajo, tomado de utils/flavors.ts. El precio base
// vive en Contentful, así que aquí va como constante.
//
// ⚠️ CONFIRMAR CON DICAMPO antes de usar en producción.
// ─────────────────────────────────────────────────────────────
const BASE_PRICE: Record<Presentation, number> = {
  KILO: 12_000,
  LIBRA: 6_500,
};

const NET_WEIGHT_G: Record<Presentation, number> = {
  KILO: 1000,
  LIBRA: 500,
};

type FlavorSeed = {
  /** Sabor tal como lo nombra la operación */
  flavor: string;
  /** Nombre comercial del producto */
  name: string;
  category: ProductCategory;
  /** Prefijo del SKU */
  code: string;
  /**
   * Recargo sobre el precio base, por presentación.
   * `null` significa que ese sabor no se vende en esa presentación,
   * por lo que no se crea la variante.
   */
  surcharge: { KILO: number | null; LIBRA: number | null };
};

/** Catálogo real, migrado de ../dicampo-app-pedidos/src/app/utils/flavors.ts */
const FLAVORS: FlavorSeed[] = [
  { flavor: "Mango", name: "Pulpa de Mango", category: ProductCategory.PULPA, code: "MAN", surcharge: { KILO: 0, LIBRA: 0 } },
  { flavor: "Fresa", name: "Pulpa de Fresa", category: ProductCategory.PULPA, code: "FRE", surcharge: { KILO: 0, LIBRA: 0 } },
  { flavor: "Lulo", name: "Pulpa de Lulo", category: ProductCategory.PULPA, code: "LUL", surcharge: { KILO: 0, LIBRA: 0 } },
  { flavor: "Mora", name: "Pulpa de Mora", category: ProductCategory.PULPA, code: "MOR", surcharge: { KILO: 0, LIBRA: 0 } },
  { flavor: "Guanábana", name: "Pulpa de Guanábana", category: ProductCategory.PULPA, code: "GUA", surcharge: { KILO: 3_000, LIBRA: 1_500 } },
  { flavor: "Maracuyá", name: "Pulpa de Maracuyá", category: ProductCategory.PULPA, code: "MAR", surcharge: { KILO: 6_000, LIBRA: 3_000 } },
  { flavor: "Mandarina", name: "Pulpa de Mandarina", category: ProductCategory.PULPA, code: "MND", surcharge: { KILO: 5_000, LIBRA: null } },
  { flavor: "Frutos Rojos", name: "Mezcla de Frutos Rojos", category: ProductCategory.MEZCLA, code: "FRO", surcharge: { KILO: 1_000, LIBRA: null } },
  { flavor: "Frutos Amarillos", name: "Mezcla de Frutos Amarillos", category: ProductCategory.MEZCLA, code: "FAM", surcharge: { KILO: 3_000, LIBRA: null } },
  { flavor: "Limonada", name: "Base para Limonada Natural", category: ProductCategory.LIMONADA, code: "LIM", surcharge: { KILO: 2_000, LIBRA: null } },
  { flavor: "Limón Hierbabuena", name: "Limonada de Hierbabuena", category: ProductCategory.LIMONADA, code: "LHB", surcharge: { KILO: 5_000, LIBRA: null } },
  { flavor: "Limón Cereza", name: "Limonada de Cereza", category: ProductCategory.LIMONADA, code: "LCE", surcharge: { KILO: 5_000, LIBRA: null } },
  { flavor: "Limón Mango Biche", name: "Limonada de Mango Biche", category: ProductCategory.LIMONADA, code: "LMB", surcharge: { KILO: 5_000, LIBRA: null } },
  { flavor: "Limón Coco", name: "Limonada de Coco", category: ProductCategory.LIMONADA, code: "LCO", surcharge: { KILO: 12_000, LIBRA: null } },
];

/** Zonas de reparto en Bogotá */
const ZONES = [
  { name: "Norte", description: "Usaquén, Suba, Barrios Unidos" },
  { name: "Chapinero", description: "Chapinero, Zona G, Zona T" },
  { name: "Centro", description: "La Candelaria, Santa Fe, Teusaquillo, Los Mártires" },
  { name: "Occidente", description: "Engativá, Fontibón, Kennedy, Puente Aranda" },
  { name: "Sur", description: "Bosa, Tunjuelito, Usme, Ciudad Bolívar, Rafael Uribe" },
  { name: "Municipios aledaños", description: "Soacha, Chía, Cajicá, Mosquera, Funza" },
];

const DEFAULT_PRICE_LIST = "Lista General";

async function main() {
  console.log("Sembrando datos maestros del CRM Dicampo…\n");

  // ── Usuario administrador ──────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "Faltan SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD. Revisa tu archivo .env.",
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    // No se pisa la contraseña si el usuario ya existe: evita revertir un
    // cambio de clave hecho desde la aplicación al re-ejecutar el seed.
    update: { role: UserRole.ADMIN, active: true },
    create: {
      email: adminEmail,
      name: process.env.SEED_ADMIN_NAME ?? "Administrador",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log(`  Administrador: ${adminEmail}`);

  // ── Zonas de reparto ───────────────────────────────────────
  for (const zone of ZONES) {
    await prisma.deliveryZone.upsert({
      where: { name: zone.name },
      update: { description: zone.description },
      create: zone,
    });
  }
  console.log(`  Zonas de reparto: ${ZONES.length}`);

  // ── Lista de precios por defecto ───────────────────────────
  const priceList = await prisma.priceList.upsert({
    where: { name: DEFAULT_PRICE_LIST },
    update: { isDefault: true, active: true },
    create: { name: DEFAULT_PRICE_LIST, isDefault: true },
  });

  // ── Catálogo: productos, variantes y precios ───────────────
  let variantCount = 0;

  for (const item of FLAVORS) {
    const product = await prisma.product.upsert({
      where: { flavor: item.flavor },
      update: { name: item.name, category: item.category },
      create: {
        flavor: item.flavor,
        name: item.name,
        category: item.category,
      },
    });

    for (const presentation of [Presentation.KILO, Presentation.LIBRA]) {
      const surcharge = item.surcharge[presentation];
      // `null` = Dicampo no vende ese sabor en esa presentación.
      if (surcharge === null) continue;

      const sku = `${item.code}-${presentation === Presentation.KILO ? "K" : "L"}`;

      const variant = await prisma.productVariant.upsert({
        where: {
          productId_presentation: { productId: product.id, presentation },
        },
        update: { sku, netWeightG: NET_WEIGHT_G[presentation] },
        create: {
          productId: product.id,
          sku,
          presentation,
          netWeightG: NET_WEIGHT_G[presentation],
        },
      });

      await prisma.priceListItem.upsert({
        where: {
          priceListId_variantId_minQty: {
            priceListId: priceList.id,
            variantId: variant.id,
            minQty: 1,
          },
        },
        update: { price: BASE_PRICE[presentation] + surcharge },
        create: {
          priceListId: priceList.id,
          variantId: variant.id,
          price: BASE_PRICE[presentation] + surcharge,
          minQty: 1,
        },
      });

      variantCount += 1;
    }
  }

  console.log(`  Productos: ${FLAVORS.length}`);
  console.log(`  Variantes con precio: ${variantCount}`);
  console.log(`\nListo. Recuerda confirmar los precios base con Dicampo.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Falló el seed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
