import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { getProduct } from "@/server/services/catalog";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/catalog/product-form";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const product = await getProduct(id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Editar ${product.name}`} />
      <ProductForm
        product={{
          id: product.id,
          name: product.name,
          flavor: product.flavor,
          category: product.category,
          description: product.description ?? undefined,
          taxRate: Number(product.taxRate),
          active: product.active,
        }}
      />
    </div>
  );
}
