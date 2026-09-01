import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/catalog/product-form";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nuevo producto"
        description="Crea el sabor; después le añades sus presentaciones y precios."
      />
      <ProductForm />
    </div>
  );
}
