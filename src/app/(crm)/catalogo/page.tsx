import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser, isAdmin } from "@/server/guards";
import { listProducts } from "@/server/services/catalog";
import { productListQuerySchema } from "@/server/validators/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatCOP } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  PRESENTATION_LABEL,
  PRODUCT_CATEGORY_LABEL,
  toOptions,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Catálogo" };

const categoryOptions = toOptions(PRODUCT_CATEGORY_LABEL);

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const canEdit = isAdmin(user);
  const params = await searchParams;
  const query = productListQuerySchema.parse(flattenSearchParams(params));

  const { products, priceList } = await listProducts(query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catálogo"
        description={
          priceList
            ? `Precios de la lista "${priceList.name}"`
            : "Sin lista de precios configurada"
        }
        actions={
          canEdit && (
            <>
              <Link
                href="/catalogo/precios"
                className={buttonVariants({ variant: "secondary" })}
              >
                Editar precios
              </Link>
              <Link href="/catalogo/nuevo" className={buttonVariants()}>
                <Plus aria-hidden="true" />
                Nuevo producto
              </Link>
            </>
          )
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Nombre o sabor"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="category" className="text-xs font-medium text-muted-foreground">
              Categoría
            </label>
            <Select
              id="category"
              name="category"
              defaultValue={query.category ?? ""}
              className="mt-1"
            >
              <option value="">Todas</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="includeInactive" className="text-xs font-medium text-muted-foreground">
              Mostrar
            </label>
            <Select
              id="includeInactive"
              name="includeInactive"
              defaultValue={query.includeInactive ? "1" : "0"}
              className="mt-1"
            >
              <option value="0">Solo activos</option>
              <option value="1">Todos</option>
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {products.length === 0 ? (
          <EmptyState
            title="No hay productos que coincidan"
            description="Ejecuta el seed para cargar el catálogo de sabores, o ajusta los filtros."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                  <th scope="col" className="px-4 py-2 font-medium">Categoría</th>
                  <th scope="col" className="px-4 py-2 font-medium">Presentaciones</th>
                  <th scope="col" className="px-4 py-2 font-medium">IVA</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0 align-top hover:bg-muted"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        <Link
                          href={`/catalogo/${product.id}`}
                          className="text-primary hover:underline"
                        >
                          {product.name}
                        </Link>
                        {!product.active && (
                          <Badge tone="neutral" className="ml-2">
                            Inactivo
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.flavor}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {PRODUCT_CATEGORY_LABEL[product.category]}
                    </td>

                    <td className="px-4 py-3">
                      {product.variants.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Sin presentaciones
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {product.variants.map((variant) => {
                            // Solo se cargó el escalón base (minQty = 1).
                            const basePrice = variant.priceItems?.[0]?.price;

                            return (
                              <li
                                key={variant.id}
                                className="flex items-center gap-3 text-xs"
                              >
                                <span className="w-14 text-muted-foreground">
                                  {PRESENTATION_LABEL[variant.presentation]}
                                </span>
                                <span className="tabular w-24 font-medium text-foreground">
                                  {basePrice !== undefined
                                    ? formatCOP(basePrice)
                                    : "Sin precio"}
                                </span>
                                <span className="text-muted-foreground">
                                  {variant.sku}
                                </span>
                                {!variant.active && (
                                  <Badge tone="neutral">Inactiva</Badge>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>

                    <td className="tabular px-4 py-3 text-muted-foreground">
                      {Number(product.taxRate) === 0
                        ? "Excluido"
                        : `${(Number(product.taxRate) * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
