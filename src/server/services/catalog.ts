import { prisma } from "../db";
import { ConflictError, NotFoundError } from "../errors";
import { Presentation } from "@/generated/prisma/enums";
import {
  NET_WEIGHT_G,
  type ProductCreateInput,
  type ProductListQuery,
  type ProductUpdateInput,
  type VariantCreateInput,
  type VariantUpdateInput,
} from "../validators/catalog";

/**
 * Catálogo: productos (un sabor cada uno) y sus variantes vendibles.
 *
 * Una variante es la combinación producto × presentación. Solo existen las
 * que Dicampo realmente vende, así que un sabor disponible únicamente por
 * kilo simplemente no tiene variante LIBRA — no hace falta marcarlo.
 */

/**
 * Genera un SKU legible a partir del sabor: "Limón Hierbabuena" + KILO →
 * "LIMHIE-K". Se normalizan los acentos para que el código sea ASCII.
 */
export function buildSku(flavor: string, presentation: Presentation): string {
  const slug = flavor
    // NFD separa la letra de su tilde; el rango borra las tildes sueltas.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 6);

  return `${slug}-${presentation === Presentation.KILO ? "K" : "L"}`;
}

export async function listProducts(query: ProductListQuery) {
  const { search, category, includeInactive, priceListId } = query;

  // Si no se indica lista, se usan los precios de la lista por defecto.
  const priceList = priceListId
    ? await prisma.priceList.findUnique({
        where: { id: priceListId },
        select: { id: true, name: true },
      })
    : await prisma.priceList.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true, name: true },
      });

  const products = await prisma.product.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { flavor: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      variants: {
        where: includeInactive ? {} : { active: true },
        orderBy: { presentation: "asc" },
        include: {
          priceItems: priceList
            ? {
                where: { priceListId: priceList.id },
                orderBy: { minQty: "asc" },
              }
            : false,
        },
      },
    },
  });

  return { products, priceList };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        orderBy: { presentation: "asc" },
        include: {
          priceItems: {
            include: { priceList: { select: { id: true, name: true } } },
            orderBy: { minQty: "asc" },
          },
        },
      },
    },
  });

  if (!product) throw new NotFoundError("El producto");
  return product;
}

export async function createProduct(input: ProductCreateInput) {
  const existing = await prisma.product.findUnique({
    where: { flavor: input.flavor },
    select: { id: true, name: true },
  });

  if (existing) {
    throw new ConflictError(
      `Ya existe un producto para el sabor "${input.flavor}" (${existing.name}).`,
    );
  }

  const { firstPresentation, firstPrice, ...productData } = input;

  // Producto y primera presentación se crean juntos: un producto sin ninguna
  // variante no se puede vender, así que dejarlo a medias no sirve de nada.
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: productData });

    if (!firstPresentation) return product;

    const sku = buildSku(product.flavor, firstPresentation);
    const skuClash = await tx.productVariant.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (skuClash) {
      throw new ConflictError(
        `El SKU "${sku}" ya está en uso. Cambia el sabor o asigna el SKU a mano.`,
      );
    }

    const variant = await tx.productVariant.create({
      data: {
        productId: product.id,
        sku,
        presentation: firstPresentation,
        netWeightG: NET_WEIGHT_G[firstPresentation],
      },
    });

    if (firstPrice !== undefined) {
      const defaultList = await tx.priceList.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      });

      if (defaultList) {
        await tx.priceListItem.create({
          data: {
            priceListId: defaultList.id,
            variantId: variant.id,
            price: firstPrice,
            minQty: 1,
          },
        });
      }
    }

    return product;
  });
}

export async function updateProduct(id: string, input: ProductUpdateInput) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, flavor: true },
  });
  if (!product) throw new NotFoundError("El producto");

  if (input.flavor && input.flavor !== product.flavor) {
    const clash = await prisma.product.findUnique({
      where: { flavor: input.flavor },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictError(`Ya existe un producto con el sabor "${input.flavor}".`);
    }
  }

  return prisma.product.update({ where: { id }, data: input });
}

/**
 * Crea una variante y, si se envía precio, lo registra en la lista por
 * defecto. Ambas cosas van en una transacción: una variante sin precio no
 * se puede vender, así que no tiene sentido dejarla a medias.
 */
export async function addVariant(productId: string, input: VariantCreateInput) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, flavor: true },
  });
  if (!product) throw new NotFoundError("El producto");

  const duplicate = await prisma.productVariant.findUnique({
    where: {
      productId_presentation: { productId, presentation: input.presentation },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new ConflictError(
      "El producto ya tiene una variante en esa presentación.",
    );
  }

  const sku = input.sku ?? buildSku(product.flavor, input.presentation);

  const skuClash = await prisma.productVariant.findUnique({
    where: { sku },
    select: { id: true },
  });
  if (skuClash) {
    throw new ConflictError(`El SKU "${sku}" ya está en uso.`);
  }

  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({
      data: {
        productId,
        sku,
        presentation: input.presentation,
        netWeightG: NET_WEIGHT_G[input.presentation],
        active: input.active,
      },
    });

    if (input.price !== undefined) {
      const defaultList = await tx.priceList.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      });

      if (defaultList) {
        await tx.priceListItem.create({
          data: {
            priceListId: defaultList.id,
            variantId: variant.id,
            price: input.price,
            minQty: 1,
          },
        });
      }
    }

    return variant;
  });
}

export async function updateVariant(id: string, input: VariantUpdateInput) {
  const variant = await prisma.productVariant.findUnique({
    where: { id },
    select: { id: true, sku: true },
  });
  if (!variant) throw new NotFoundError("La variante");

  if (input.sku && input.sku !== variant.sku) {
    const clash = await prisma.productVariant.findUnique({
      where: { sku: input.sku },
      select: { id: true },
    });
    if (clash) throw new ConflictError(`El SKU "${input.sku}" ya está en uso.`);
  }

  return prisma.productVariant.update({ where: { id }, data: input });
}

/** Variantes activas con su precio, para armar un pedido. */
export async function listSellableVariants(priceListId?: string) {
  const priceList = priceListId
    ? await prisma.priceList.findUnique({
        where: { id: priceListId },
        select: { id: true },
      })
    : await prisma.priceList.findFirst({
        where: { isDefault: true, active: true },
        select: { id: true },
      });

  return prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { presentation: "asc" }],
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { id: true, name: true, flavor: true, taxRate: true } },
      priceItems: priceList
        ? {
            where: { priceListId: priceList.id },
            orderBy: { minQty: "asc" },
            select: { price: true, minQty: true },
          }
        : false,
    },
  });
}
