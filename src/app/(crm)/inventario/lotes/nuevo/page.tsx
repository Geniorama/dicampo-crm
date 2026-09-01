import type { Metadata } from "next";
import { INVENTORY_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LotForm, type VariantChoice } from "@/components/inventory/lot-form";

export const metadata: Metadata = { title: "Registrar producción" };

export default async function NewLotPage() {
  await requireUserPage(INVENTORY_ROLES);

  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { presentation: "asc" }],
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { name: true } },
    },
  });

  const choices: VariantChoice[] = variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    presentation: variant.presentation,
    productName: variant.product.name,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Registrar producción"
        description="Cada lote entra con su fecha de vencimiento, que determina el orden de despacho."
      />

      {choices.length === 0 ? (
        <Card>
          <EmptyState
            title="El catálogo está vacío"
            description="Crea primero un producto con su presentación."
          />
        </Card>
      ) : (
        <LotForm variants={choices} />
      )}
    </div>
  );
}
