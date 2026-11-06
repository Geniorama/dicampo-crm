import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES, scopeToOwnPortfolio } from "@/server/guards";
import { prisma } from "@/server/db";
import { listSellableVariants } from "@/server/services/catalog";
import { getStockSummary } from "@/server/services/inventory";
import { listSellerOptions } from "@/server/services/orders";
import { todayInBogota } from "@/server/services/routes";
import { toKilos } from "@/lib/production";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import {
  QuoteForm,
  type QuoteClientOption,
  type QuoteVariantOption,
} from "@/components/quotes/quote-form";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const { clientId } = await searchParams;

  const [clients, variants, priceLists, priceItems, stock, sellers] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...scopeToOwnPortfolio(user),
        status: { in: ["ACTIVO", "PROSPECTO"] },
      },
      orderBy: { businessName: "asc" },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        nit: true,
        type: true,
        phone: true,
        email: true,
        notes: true,
        isSuperDistributor: true,
        priceListId: true,
        billingMode: true,
        contacts: {
          where: { active: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { firstName: true, lastName: true },
        },
        addresses: {
          where: { active: true },
          orderBy: { isPrimary: "desc" },
          select: { id: true, label: true, address: true, locality: true, neighborhood: true },
        },
      },
    }),
    listSellableVariants(),
    prisma.priceList.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isDefault: true },
    }),
    // Precio base de cada variante en cada lista: el escalón de menor cantidad.
    prisma.priceListItem.findMany({
      orderBy: { minQty: "desc" },
      select: { priceListId: true, variantId: true, price: true },
    }),
    getStockSummary(),
    listSellerOptions(),
  ]);

  const defaultListId = priceLists.find((list) => list.isDefault)?.id ?? "";

  // Se recorre de mayor a menor minQty para que el escalón base sea el último
  // en escribirse.
  const priceByVariant = new Map<string, Record<string, number>>();
  for (const item of priceItems) {
    const prices = priceByVariant.get(item.variantId) ?? {};
    prices[item.priceListId] = Number(item.price);
    priceByVariant.set(item.variantId, prices);
  }

  const clientOptions: QuoteClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.tradeName ?? client.businessName,
    // Se busca también por razón social y NIT, que es como se conoce a muchos.
    detail:
      client.tradeName && client.tradeName !== client.businessName
        ? client.businessName
        : undefined,
    keywords: [client.businessName, client.nit],
    priceListId: client.priceListId ?? defaultListId,
    billingMode: client.billingMode,
    tier: client.isSuperDistributor
      ? "Superdistribuidor"
      : (priceLists.find((list) => list.id === (client.priceListId ?? defaultListId))?.name ?? "—"),
    businessName: client.businessName,
    nit: client.nit,
    type: client.type,
    phone: client.phone,
    email: client.email,
    notes: client.notes,
    contactName: client.contacts[0]
      ? [client.contacts[0].firstName, client.contacts[0].lastName].filter(Boolean).join(" ")
      : null,
    addresses: client.addresses,
  }));

  // Un vendedor solo cotiza a su nombre; un administrador elige el asesor.
  const advisors = sellers
    .filter((seller) => user.role === "ADMIN" || seller.id === user.id)
    .map((seller) => ({ id: seller.id, name: seller.name }));

  // Existencias vigentes (lotes DISPONIBLES con saldo) por variante y, en kilos
  // de pulpa, por sabor: una libra vale medio kilo y los zumos no suman.
  const availableByVariant = new Map(stock.map((row) => [row.id, row.available]));
  const kilosByProduct = new Map<string, number>();
  for (const row of stock) {
    kilosByProduct.set(
      row.product.id,
      (kilosByProduct.get(row.product.id) ?? 0) + toKilos(row.available, row.presentation),
    );
  }

  const variantOptions: QuoteVariantOption[] = variants.map((variant) => ({
    id: variant.id,
    presentation: variant.presentation,
    productName: variant.product.name,
    taxRate: Number(variant.product.taxRate),
    available: availableByVariant.get(variant.id) ?? 0,
    flavorKilos: kilosByProduct.get(variant.product.id) ?? 0,
    priceByList: priceByVariant.get(variant.id) ?? {},
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Nueva cotización"
        description="Al guardarla se crea el pedido y se reserva el inventario."
      />

      {variantOptions.length === 0 ? (
        <Card>
          <EmptyState
            title="El catálogo está vacío"
            description="Ejecuta `npm run db:seed` para cargar los sabores y sus precios."
          />
        </Card>
      ) : (
        <QuoteForm
          clients={clientOptions}
          variants={variantOptions}
          priceLists={priceLists.map((list) => ({ id: list.id, name: list.name }))}
          advisors={advisors}
          defaultAdvisorId={advisors.some((a) => a.id === user.id) ? user.id : (advisors[0]?.id ?? "")}
          today={todayInBogota()}
          isAdmin={user.role === "ADMIN"}
          initialClientId={clientOptions.some((c) => c.id === clientId) ? clientId : undefined}
        />
      )}
    </div>
  );
}
