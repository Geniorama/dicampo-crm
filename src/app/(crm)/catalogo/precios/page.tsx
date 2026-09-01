import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { listPriceLists } from "@/server/services/pricing";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PriceListEditor,
  type PriceListChoice,
  type PriceRow,
} from "@/components/catalog/price-list-editor";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Precios" };

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAdminPage();
  const params = flattenSearchParams(await searchParams);

  const lists = await listPriceLists();
  if (lists.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader title="Precios" />
        <Card>
          <EmptyState
            title="No hay listas de precios"
            description="Ejecuta `npm run db:seed` para crear la lista por defecto."
          />
        </Card>
      </div>
    );
  }

  // Lista pedida por URL, o la marcada por defecto, o la primera.
  const activeList =
    lists.find((list) => list.id === params.priceListId) ??
    lists.find((list) => list.isDefault) ??
    lists[0];

  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { presentation: "asc" }],
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true } },
      priceItems: {
        where: { priceListId: activeList.id, minQty: 1 },
        select: { price: true },
      },
    },
  });

  const rows: PriceRow[] = variants.map((variant) => ({
    variantId: variant.id,
    sku: variant.sku,
    productName: variant.product.name,
    presentation: variant.presentation,
    price: variant.priceItems[0] ? Number(variant.priceItems[0].price) : null,
  }));

  const choices: PriceListChoice[] = lists.map((list) => ({
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Precios"
        description={`${rows.length} presentaciones activas en "${activeList.name}"`}
      />
      <PriceListEditor
        priceLists={choices}
        activeListId={activeList.id}
        rows={rows}
      />
    </div>
  );
}
