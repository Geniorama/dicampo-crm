import { prisma } from "../db";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { Presentation } from "@/generated/prisma/enums";
import { comparisonKey } from "./helpers";

/**
 * Índices de apoyo para resolver las referencias de un archivo.
 *
 * Un archivo trae nombres, no identificadores: "vendedor@dicampo.co",
 * "Chapinero", "MANGO-K". Traducirlos fila por fila serían miles de consultas,
 * así que cada índice se arma una sola vez por importación. Son catálogos
 * pequeños (usuarios, zonas, listas, variantes) y la cartera de clientes, que
 * a la escala de Dicampo cabe holgadamente en una consulta.
 *
 * Los índices son **mutables a propósito**: al crear un registro se recuerda,
 * para que dos filas del mismo archivo que hablan del mismo cliente no lo
 * creen dos veces.
 */

/** Varias entradas bajo la misma clave significan que el nombre es ambiguo. */
type Index<T> = Map<string, T[]>;

function add<T>(index: Index<T>, key: string, value: T): void {
  if (!key) return;
  const current = index.get(key);
  if (current) current.push(value);
  else index.set(key, [value]);
}

/**
 * Resuelve una referencia por nombre. Si dos registros comparten nombre se
 * rechaza la fila: elegir uno al azar metería datos en el cliente equivocado.
 */
function unique<T>(index: Index<T>, key: string): T | undefined {
  const matches = index.get(key);
  if (!matches || matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new ConflictError(
      "Hay más de un registro con ese nombre; usa un identificador más preciso.",
    );
  }
  return matches[0];
}

// ── Usuarios ─────────────────────────────────────────────────

export type UserRef = { id: string; name: string; email: string };

export type UserIndex = Index<UserRef>;

export async function loadUserIndex(): Promise<UserIndex> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
  });

  const index: UserIndex = new Map();
  for (const user of users) {
    add(index, comparisonKey(user.email), user);
    add(index, comparisonKey(user.name), user);
  }

  return index;
}

/** Acepta el correo o el nombre del vendedor, que es lo que trae una hoja. */
export function resolveUser(
  index: UserIndex,
  raw: string | undefined,
): UserRef | undefined {
  if (!raw) return undefined;

  const user = unique(index, comparisonKey(raw));
  if (!user) {
    throw new NotFoundError(`El usuario "${raw}"`);
  }

  return user;
}

// ── Listas de precios ────────────────────────────────────────

export type PriceListRef = { id: string; name: string };

export type PriceListIndex = {
  byName: Index<PriceListRef>;
  fallback: PriceListRef | null;
};

export async function loadPriceListIndex(): Promise<PriceListIndex> {
  const lists = await prisma.priceList.findMany({
    where: { active: true },
    select: { id: true, name: true, isDefault: true },
  });

  const byName: Index<PriceListRef> = new Map();
  for (const list of lists) add(byName, comparisonKey(list.name), list);

  return {
    byName,
    fallback: lists.find((list) => list.isDefault) ?? null,
  };
}

/** Sin nombre en la fila aplica la lista por defecto, como en el resto del CRM. */
export function resolvePriceList(
  index: PriceListIndex,
  raw: string | undefined,
): PriceListRef {
  if (raw) {
    const list = unique(index.byName, comparisonKey(raw));
    if (!list) throw new NotFoundError(`La lista de precios "${raw}"`);
    return list;
  }

  if (!index.fallback) {
    throw new ValidationError(
      "No hay una lista de precios por defecto. Indica la lista en el archivo o créala antes de importar.",
    );
  }

  return index.fallback;
}

// ── Zonas de despacho ────────────────────────────────────────

export type ZoneIndex = Index<{ id: string; name: string }>;

export async function loadZoneIndex(): Promise<ZoneIndex> {
  const zones = await prisma.deliveryZone.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  const index: ZoneIndex = new Map();
  for (const zone of zones) add(index, comparisonKey(zone.name), zone);

  return index;
}

/**
 * La zona es opcional: si el archivo trae un barrio que no es ninguna de las
 * zonas configuradas, la sede entra sin zona en vez de perderse la fila. La
 * zona se asigna después al planear la ruta.
 */
export function resolveZone(
  index: ZoneIndex,
  raw: string | undefined,
): { id: string; name: string } | undefined {
  if (!raw) return undefined;
  return index.get(comparisonKey(raw))?.[0];
}

// ── Variantes vendibles ──────────────────────────────────────

export type VariantRef = {
  id: string;
  sku: string;
  presentation: Presentation;
  productId: string;
  productName: string;
  flavor: string;
};

export type VariantIndex = {
  bySku: Index<VariantRef>;
  byFlavor: Index<VariantRef>;
};

export async function loadVariantIndex(): Promise<VariantIndex> {
  const variants = await prisma.productVariant.findMany({
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { id: true, name: true, flavor: true } },
    },
  });

  const bySku: Index<VariantRef> = new Map();
  const byFlavor: Index<VariantRef> = new Map();

  for (const variant of variants) {
    const ref: VariantRef = {
      id: variant.id,
      sku: variant.sku,
      presentation: variant.presentation,
      productId: variant.product.id,
      productName: variant.product.name,
      flavor: variant.product.flavor,
    };

    add(bySku, comparisonKey(variant.sku), ref);
    add(byFlavor, `${comparisonKey(variant.product.flavor)}|${variant.presentation}`, ref);
    // También por nombre de producto: muchas hojas traen "Pulpa de mango".
    add(byFlavor, `${comparisonKey(variant.product.name)}|${variant.presentation}`, ref);
  }

  return { bySku, byFlavor };
}

/** Localiza la variante por SKU o, en su defecto, por sabor y presentación. */
export function resolveVariant(
  index: VariantIndex,
  reference: { sku?: string; flavor?: string; presentation?: Presentation },
): VariantRef {
  if (reference.sku) {
    const variant = unique(index.bySku, comparisonKey(reference.sku));
    if (variant) return variant;
    throw new NotFoundError(`El SKU "${reference.sku}"`);
  }

  if (!reference.flavor) {
    throw new ValidationError("Falta el SKU o el sabor del producto.");
  }

  if (!reference.presentation) {
    throw new ValidationError(
      `Falta la presentación de "${reference.flavor}": sin ella no se sabe a qué producto vendible se refiere la fila.`,
    );
  }

  const variant = unique(
    index.byFlavor,
    `${comparisonKey(reference.flavor)}|${reference.presentation}`,
  );
  if (!variant) {
    throw new NotFoundError(
      `El producto "${reference.flavor}" en esa presentación`,
    );
  }

  return variant;
}

// ── Clientes ─────────────────────────────────────────────────

export type ClientRef = {
  id: string;
  nit: string | null;
  businessName: string;
  ownerId: string | null;
};

export type ClientIndex = {
  byNit: Map<string, ClientRef>;
  byName: Index<ClientRef>;
  /** Recuerda un cliente recién creado para las siguientes filas. */
  remember(client: ClientRef, extraNames?: (string | null | undefined)[]): void;
};

export async function loadClientIndex(): Promise<ClientIndex> {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      nit: true,
      businessName: true,
      tradeName: true,
      ownerId: true,
    },
  });

  const byNit = new Map<string, ClientRef>();
  const byName: Index<ClientRef> = new Map();

  const index: ClientIndex = {
    byNit,
    byName,
    remember(client, extraNames = []) {
      if (client.nit) byNit.set(client.nit, client);
      for (const name of [client.businessName, ...extraNames]) {
        add(byName, comparisonKey(name), client);
      }
    },
  };

  for (const client of clients) {
    index.remember(
      {
        id: client.id,
        nit: client.nit,
        businessName: client.businessName,
        ownerId: client.ownerId,
      },
      [client.tradeName],
    );
  }

  return index;
}

/** Busca al cliente de la fila por NIT y, si no, por nombre. */
export function findClient(
  index: ClientIndex,
  reference: { nit?: string; name?: string },
): ClientRef | undefined {
  if (reference.nit) {
    const byNit = index.byNit.get(reference.nit);
    if (byNit) return byNit;
  }

  if (reference.name) {
    return unique(index.byName, comparisonKey(reference.name));
  }

  return undefined;
}

/** Igual que `findClient`, pero la fila no tiene sentido sin cliente. */
export function requireClient(
  index: ClientIndex,
  reference: { nit?: string; name?: string },
): ClientRef {
  if (!reference.nit && !reference.name) {
    throw new ValidationError(
      "Falta identificar al cliente: cotéjalo por NIT o por razón social.",
    );
  }

  const client = findClient(index, reference);
  if (!client) {
    throw new NotFoundError(
      `El cliente "${reference.name ?? reference.nit}"`,
    );
  }

  return client;
}
