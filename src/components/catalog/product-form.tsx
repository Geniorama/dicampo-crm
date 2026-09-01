"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  productCreateSchema,
  type ProductCreateInput,
  type ProductFormValues,
} from "@/server/validators/catalog";
import { PRODUCT_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const categoryOptions = toOptions(PRODUCT_CATEGORY_LABEL);

/**
 * Tarifas de IVA vigentes en Colombia. Se ofrecen como opciones en vez de un
 * campo libre: son las únicas válidas, y escribir "19" en lugar de "0.19"
 * multiplicaría el impuesto por cien sin que nadie lo note.
 */
const TAX_OPTIONS = [
  { value: "0", label: "0 % — excluido o exento" },
  { value: "0.05", label: "5 %" },
  { value: "0.19", label: "19 %" },
];

type Props = {
  /** Producto a editar; si falta, el formulario crea uno nuevo. */
  product?: Partial<ProductCreateInput> & { id: string };
};

export function ProductForm({ product }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(product);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductCreateInput>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: {
      name: product?.name ?? "",
      flavor: product?.flavor ?? "",
      category: product?.category ?? "PULPA",
      description: product?.description ?? undefined,
      taxRate: product?.taxRate ?? 0,
      active: product?.active ?? true,
      firstPresentation: "KILO",
    },
  });

  async function onSubmit(values: ProductCreateInput) {
    setFormError(null);

    try {
      if (isEditing) {
        await api.patch(`/api/catalogo/productos/${product!.id}`, values);
        router.push(`/catalogo/${product!.id}`);
      } else {
        const createdProduct = await api.post<{ id: string }>(
          "/api/catalogo/productos",
          values,
        );
        router.push(`/catalogo/${createdProduct.id}`);
      }
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo guardar el producto.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos del producto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="name"
            label="Nombre comercial"
            error={errors.name?.message}
            required
          >
            {(props) => (
              <Input {...props} {...register("name")} placeholder="Pulpa de Mango" />
            )}
          </Field>

          <Field
            id="flavor"
            label="Sabor"
            hint="Único: un sabor = un producto"
            error={errors.flavor?.message}
            required
          >
            {(props) => (
              <Input {...props} {...register("flavor")} placeholder="Mango" />
            )}
          </Field>

          <Field id="category" label="Categoría" error={errors.category?.message}>
            {(props) => (
              <Select {...props} {...register("category")}>
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="taxRate"
            label="IVA"
            hint="La pulpa de fruta suele ir excluida"
            error={errors.taxRate?.message}
          >
            {(props) => (
              <Select {...props} {...register("taxRate")}>
                {TAX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="description"
            label="Descripción"
            error={errors.description?.message}
            className="sm:col-span-2"
          >
            {(props) => (
              <Textarea
                {...props}
                {...register("description")}
                placeholder="Notas de sabor, usos sugeridos, rendimiento…"
              />
            )}
          </Field>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                {...register("active")}
                className="size-4 rounded border-input accent-[var(--primary)]"
              />
              Activo
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Un producto inactivo desaparece del catálogo y de los pedidos
              nuevos, pero se conserva en el historial.
            </p>
          </div>
        </CardContent>
      </Card>

      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Primera presentación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              El producto es el <strong>sabor</strong>; el kilo y la libra son
              sus <strong>presentaciones</strong>, cada una con su propio SKU y
              precio. Empieza por una: la otra se añade después desde la ficha,
              y un sabor que solo se venda por kilo simplemente no tendrá libra.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="firstPresentation"
                label="Presentación"
                error={errors.firstPresentation?.message}
              >
                {(props) => (
                  <Select {...props} {...register("firstPresentation")}>
                    <option value="KILO">Kilo — 1.000 g</option>
                    <option value="LIBRA">Libra — 500 g</option>
                  </Select>
                )}
              </Field>

              <Field
                id="firstPrice"
                label="Precio (COP)"
                hint="Se registra en la lista por defecto"
                error={errors.firstPrice?.message}
              >
                {(props) => (
                  <Input
                    {...props}
                    {...register("firstPrice")}
                    type="number"
                    min={0}
                    step={100}
                    placeholder="12000"
                  />
                )}
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Guardando…"
            : isEditing
              ? "Guardar cambios"
              : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
