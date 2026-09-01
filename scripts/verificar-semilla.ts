import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Comprueba que la semilla dejó los datos maestros que el CRM necesita para
 * arrancar. Corre en CI sobre una base recién migrada, después de ejecutar
 * `db:seed` dos veces.
 *
 * No sustituye a las pruebas unitarias: verifica que el esquema y la semilla
 * siguen encajando, que es lo que se rompe al cambiar uno sin el otro.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

let fails = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "OK   " : "FALLO"} ${label}${ok ? "" : ` -- ${detail}`}`);
  if (!ok) fails += 1;
};

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("Falta SEED_ADMIN_EMAIL");

  const [products, variants, priced, zones, admin, defaultLists] =
    await Promise.all([
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.priceListItem.count(),
      prisma.deliveryZone.count(),
      prisma.user.findUnique({ where: { email: adminEmail } }),
      prisma.priceList.findMany({ where: { isDefault: true, active: true } }),
    ]);

  console.log("\nDatos maestros");
  check(`14 sabores en el catálogo (${products})`, products === 14);
  check(`20 variantes vendibles (${variants})`, variants === 20);
  check(`toda variante tiene precio (${priced})`, priced === variants);
  check(`6 zonas de reparto (${zones})`, zones === 6);
  check("existe el usuario administrador", admin !== null);
  check(
    "es ADMIN y está activo",
    admin?.role === "ADMIN" && admin?.active === true,
  );
  check(
    "su contraseña quedó hasheada",
    admin?.passwordHash?.startsWith("$2") === true,
  );

  console.log("\nIdempotencia (la semilla corrió dos veces en CI)");
  check(
    `solo una lista de precios por defecto (${defaultLists.length})`,
    defaultLists.length === 1,
  );
  check("no se duplicaron productos", products === 14);
  check("ni variantes", variants === 20);
  check("ni zonas", zones === 6);

  /*
   * Invariantes que sí pueden romperse. Las relaciones obligatorias las
   * garantiza Postgres con claves foráneas, así que no hace falta probarlas:
   * lo que se verifica aquí es que la semilla deje el catálogo vendible.
   */
  console.log("\nCatálogo vendible");

  const productsWithoutVariant = await prisma.product.count({
    where: { variants: { none: {} } },
  });
  check(
    `ningún sabor se quedó sin presentación (${productsWithoutVariant})`,
    productsWithoutVariant === 0,
  );

  const defaultList = defaultLists[0];
  const variantsWithoutPrice = defaultList
    ? await prisma.productVariant.count({
        where: {
          active: true,
          priceItems: { none: { priceListId: defaultList.id } },
        },
      })
    : -1;
  check(
    `toda variante activa tiene precio en la lista por defecto (${variantsWithoutPrice})`,
    variantsWithoutPrice === 0,
  );

  const kiloOnly = await prisma.product.count({
    where: { variants: { none: { presentation: "LIBRA" } } },
  });
  check(
    `8 sabores existen solo por kilo (${kiloOnly})`,
    kiloOnly === 8,
    "el catálogo real tiene 6 sabores en ambas presentaciones",
  );

  const skus = await prisma.productVariant.findMany({ select: { sku: true } });
  check(
    "no hay SKU repetidos",
    new Set(skus.map((v) => v.sku)).size === skus.length,
  );
}

main()
  .catch((error) => {
    console.error("\nError al verificar la semilla:", error);
    fails += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(
      fails === 0
        ? "\nTODO CORRECTO: semilla verificada.\n"
        : `\n${fails} COMPROBACIONES FALLARON\n`,
    );
    process.exit(fails === 0 ? 0 : 1);
  });
