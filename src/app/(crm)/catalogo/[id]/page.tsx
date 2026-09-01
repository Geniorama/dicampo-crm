import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { requireUser, isAdmin } from "@/server/guards";
import { getProduct } from "@/server/services/catalog";
import { NotFoundError } from "@/server/errors";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  VariantManager,
  type VariantRow,
} from "@/components/catalog/variant-manager";
import { formatDate } from "@/lib/format";
import { PRODUCT_CATEGORY_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Producto" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [product, defaultList] = await Promise.all([
    getProduct(id).catch((error) => {
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    prisma.priceList.findFirst({
      where: { isDefault: true, active: true },
      select: { id: true, name: true },
    }),
  ]);

  // Solo administración puede tocar el catálogo: los precios son decisión
  // comercial, no de operación.
  const canEdit = isAdmin(user);

  const variants: VariantRow[] = product.variants.map((variant) => {
    const item = variant.priceItems.find(
      (price) => price.priceListId === defaultList?.id && Number(price.minQty) === 1,
    );

    return {
      id: variant.id,
      sku: variant.sku,
      presentation: variant.presentation,
      active: variant.active,
      price: item ? Number(item.price) : null,
    };
  });

  const missingPrice = variants.filter(
    (variant) => variant.active && variant.price === null,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={product.name}
        description={
          <>
            {product.flavor} · {PRODUCT_CATEGORY_LABEL[product.category]}
            {!product.active && " · inactivo"}
          </>
        }
        actions={
          canEdit && (
            <Link
              href={`/catalogo/${product.id}/editar`}
              className={buttonVariants({ variant: "secondary" })}
            >
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          )
        }
      />

      {missingPrice.length > 0 && (
        <p
          role="status"
          className="rounded-md bg-warning-subtle px-4 py-3 text-sm text-warning"
        >
          Hay presentaciones activas sin precio en la lista por defecto: no se
          podrán añadir a un pedido hasta que se les asigne uno.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Presentaciones y precios</CardTitle>
            </CardHeader>
            <VariantManager
              productId={product.id}
              variants={variants}
              priceListId={defaultList?.id ?? null}
              priceListName={defaultList?.name ?? null}
              canEdit={canEdit}
            />
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Información</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <DataRow label="Estado">
                <Badge tone={product.active ? "success" : "neutral"}>
                  {product.active ? "Activo" : "Inactivo"}
                </Badge>
              </DataRow>
              <DataRow label="Sabor">{product.flavor}</DataRow>
              <DataRow label="Categoría">
                {PRODUCT_CATEGORY_LABEL[product.category]}
              </DataRow>
              <DataRow label="IVA">
                {Number(product.taxRate) === 0
                  ? "Excluido"
                  : `${(Number(product.taxRate) * 100).toFixed(0)} %`}
              </DataRow>
              <DataRow label="Creado">{formatDate(product.createdAt)}</DataRow>
            </dl>

            {product.description && (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                {product.description}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
