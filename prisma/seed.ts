import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  ProductCategory,
  Presentation,
  UserRole,
} from "../src/generated/prisma/enums";
import { AGENT_USER_EMAIL, AGENT_USER_NAME } from "../src/lib/agent";

/**
 * Datos maestros del CRM: zonas de reparto, catálogo de sabores, lista de
 * precios por defecto, usuario administrador y usuario del agente IA.
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
// Precios
//
// KILO: tomados del brochure comercial 2026. El brochure no publica el precio
// del kilo sino el "costo por jugo", con 1 kilo = 8 paquetes porcionados; el
// precio es ese costo × 8, redondeado a los 50 pesos (el brochure redondea el
// costo al peso: 15.950 / 8 = 1.993,75 → $1.994).
//
// LIBRA: el brochure no la menciona. Siguen los valores heredados de
// dicampo-app-pedidos.
//
// ⚠️ CONFIRMAR CON DICAMPO los precios por libra antes de usar en producción.
// ─────────────────────────────────────────────────────────────
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
   * Precio de lista en COP, sin impuestos, por presentación.
   * `null` significa que ese sabor no se vende en esa presentación,
   * por lo que no se crea la variante.
   */
  price: { KILO: number | null; LIBRA: number | null };
};

/**
 * Catálogo real, migrado de ../dicampo-app-pedidos/src/app/utils/flavors.ts.
 * Uva, Piña y Piña Colada no estaban allí: salen del brochure 2026.
 */
const FLAVORS: FlavorSeed[] = [
  { flavor: "Mango", name: "Pulpa de Mango", category: ProductCategory.PULPA, code: "MAN", price: { KILO: 15_950, LIBRA: 6_500 } },
  { flavor: "Fresa", name: "Pulpa de Fresa", category: ProductCategory.PULPA, code: "FRE", price: { KILO: 15_950, LIBRA: 6_500 } },
  { flavor: "Lulo", name: "Pulpa de Lulo", category: ProductCategory.PULPA, code: "LUL", price: { KILO: 15_950, LIBRA: 6_500 } },
  { flavor: "Mora", name: "Pulpa de Mora", category: ProductCategory.PULPA, code: "MOR", price: { KILO: 15_950, LIBRA: 6_500 } },
  { flavor: "Guanábana", name: "Pulpa de Guanábana", category: ProductCategory.PULPA, code: "GUA", price: { KILO: 18_700, LIBRA: 8_000 } },
  { flavor: "Maracuyá", name: "Pulpa de Maracuyá", category: ProductCategory.PULPA, code: "MAR", price: { KILO: 23_100, LIBRA: 9_500 } },
  { flavor: "Mandarina", name: "Pulpa de Mandarina", category: ProductCategory.PULPA, code: "MND", price: { KILO: 22_000, LIBRA: null } },
  { flavor: "Uva", name: "Pulpa de Uva", category: ProductCategory.PULPA, code: "UVA", price: { KILO: 14_000, LIBRA: null } },
  { flavor: "Piña", name: "Pulpa de Piña", category: ProductCategory.PULPA, code: "PIN", price: { KILO: 16_500, LIBRA: null } },
  { flavor: "Piña Colada", name: "Mezcla de Piña Colada", category: ProductCategory.MEZCLA, code: "PCO", price: { KILO: 23_100, LIBRA: null } },
  { flavor: "Frutos Rojos", name: "Mezcla de Frutos Rojos", category: ProductCategory.MEZCLA, code: "FRO", price: { KILO: 16_500, LIBRA: null } },
  { flavor: "Frutos Amarillos", name: "Mezcla de Frutos Amarillos", category: ProductCategory.MEZCLA, code: "FAM", price: { KILO: 18_150, LIBRA: null } },
  { flavor: "Limonada", name: "Base para Limonada Natural", category: ProductCategory.LIMONADA, code: "LIM", price: { KILO: 15_400, LIBRA: null } },
  { flavor: "Limón Hierbabuena", name: "Limonada de Hierbabuena", category: ProductCategory.LIMONADA, code: "LHB", price: { KILO: 20_900, LIBRA: null } },
  { flavor: "Limón Cereza", name: "Limonada de Cereza", category: ProductCategory.LIMONADA, code: "LCE", price: { KILO: 20_900, LIBRA: null } },
  { flavor: "Limón Mango Biche", name: "Limonada de Mango Biche", category: ProductCategory.LIMONADA, code: "LMB", price: { KILO: 20_800, LIBRA: null } },
  { flavor: "Limón Coco", name: "Limonada de Coco", category: ProductCategory.LIMONADA, code: "LCO", price: { KILO: 28_600, LIBRA: null } },
];

/** Zonas de reparto en Bogotá */
const ZONES = [
  { name: "Norte", description: "Usaquén, Suba, Barrios Unidos" },
  { name: "Chapinero", description: "Chapinero, Zona G, Zona T" },
  { name: "Centro", description: "La Candelaria, Santa Fe, Teusaquillo, Los Mártires" },
  { name: "Occidente", description: "Engativá, Fontibón, Kennedy, Puente Aranda" },
  { name: "Sur", description: "Bosa, Tunjuelito, Usme, Ciudad Bolívar, Rafael Uribe" },
  { name: "Municipios aledaños", description: "Mosquera, Funza, Madrid" },
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

  // ── Usuario del agente IA de WhatsApp ──────────────────────
  // Usuario de sistema, sin contraseña: no puede iniciar sesión. `active` no
  // se toca al re-sembrar, porque desactivarlo es la forma de apagar la
  // integración y la semilla no debe encenderla de nuevo. La contraseña sí se
  // anula siempre, por si alguien llegó a ponerle una.
  await prisma.user.upsert({
    where: { email: AGENT_USER_EMAIL },
    update: { role: UserRole.AGENTE_IA, passwordHash: null },
    create: {
      email: AGENT_USER_EMAIL,
      name: AGENT_USER_NAME,
      role: UserRole.AGENTE_IA,
    },
  });
  console.log(`  Agente IA: ${AGENT_USER_EMAIL}`);

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
      const price = item.price[presentation];
      // `null` = Dicampo no vende ese sabor en esa presentación.
      if (price === null) continue;

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
        update: { price },
        create: {
          priceListId: priceList.id,
          variantId: variant.id,
          price,
          minQty: 1,
        },
      });

      variantCount += 1;
    }
  }

  console.log(`  Productos: ${FLAVORS.length}`);
  console.log(`  Variantes con precio: ${variantCount}`);
  console.log(`\nListo. Recuerda confirmar los precios por libra con Dicampo.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Falló el seed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
