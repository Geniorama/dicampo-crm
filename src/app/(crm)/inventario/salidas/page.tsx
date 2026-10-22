import Link from "next/link";
import type { Metadata } from "next";
import { INVENTORY_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { OutflowForms, type VariantStockOption } from "@/components/inventory/outflow-forms";
import { formatCalendarDate } from "@/lib/format";
import { PRESENTATION_SHORT } from "@/lib/labels";

export const metadata: Metadata = { title: "Muestras y devoluciones" };

export default async function OutflowsPage() {
  await requireUserPage(INVENTORY_ROLES);

  const now = new Date();

  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { presentation: "asc" }],
    select: {
      id: true,
      presentation: true,
      product: { select: { name: true } },
      lots: {
        // Una devolución solo reingresa a un lote vigente y no bloqueado.
        where: { status: { not: "BLOQUEADO" }, expiryDate: { gt: now } },
        orderBy: { expiryDate: "asc" },
        select: { id: true, lotCode: true, expiryDate: true, quantityAvailable: true, status: true },
      },
    },
  });

  const options: VariantStockOption[] = variants.map((variant) => ({
    id: variant.id,
    label: `${variant.product.name} · ${PRESENTATION_SHORT[variant.presentation]}`,
    available: variant.lots
      .filter((lot) => lot.status === "DISPONIBLE")
      .reduce((sum, lot) => sum + Number(lot.quantityAvailable), 0),
    lots: variant.lots.map((lot) => ({
      id: lot.id,
      lotCode: lot.lotCode,
      expiry: formatCalendarDate(lot.expiryDate),
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Muestras y devoluciones"
        description="Mueven el stock y quedan en el kardex, pero no cuentan como venta."
        actions={
          <Link href="/inventario/kardex" className="text-sm font-medium text-primary hover:underline">
            Ver kardex
          </Link>
        }
      />

      <OutflowForms variants={options} />
    </div>
  );
}
