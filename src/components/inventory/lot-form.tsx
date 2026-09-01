"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  lotCreateSchema,
  type LotCreateInput,
  type LotFormValues,
} from "@/server/validators/inventory";
import { PRESENTATION_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Presentation } from "@/generated/prisma/enums";

export type VariantChoice = {
  id: string;
  sku: string;
  productName: string;
  presentation: Presentation;
};

/** Vida útil habitual de la pulpa congelada; solo precarga la fecha. */
const DEFAULT_SHELF_LIFE_MONTHS = 12;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Registro de una entrada de producción.
 *
 * Cada lote necesita fecha de vencimiento porque el despacho es FEFO: sin
 * ella, el sistema no sabría cuál sacar primero.
 */
export function LotForm({ variants }: { variants: VariantChoice[] }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date();
  const defaultExpiry = new Date(today);
  defaultExpiry.setMonth(defaultExpiry.getMonth() + DEFAULT_SHELF_LIFE_MONTHS);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LotFormValues, unknown, LotCreateInput>({
    resolver: zodResolver(lotCreateSchema),
    defaultValues: {
      variantId: "",
      lotCode: "",
      productionDate: isoDate(today),
      expiryDate: isoDate(defaultExpiry),
      quantity: 0,
    },
  });

  const variantId = watch("variantId");

  /**
   * Sugiere un código de lote con el formato de la operación:
   * L-AAAAMMDD-SKU. Se puede sobrescribir.
   */
  function suggestLotCode(nextVariantId: string, productionDate?: string) {
    const variant = variants.find((item) => item.id === nextVariantId);
    if (!variant) return;

    const date = (productionDate ?? isoDate(today)).replace(/-/g, "");
    setValue("lotCode", `L-${date}-${variant.sku}`, { shouldValidate: true });
  }

  async function onSubmit(values: LotCreateInput) {
    setFormError(null);

    try {
      await api.post("/api/inventario/lotes", values);
      router.push("/inventario");
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo registrar el lote.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Entrada de producción</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="variantId"
            label="Producto y presentación"
            error={errors.variantId?.message}
            required
            className="sm:col-span-2"
          >
            {(props) => (
              <Select
                {...props}
                {...register("variantId", {
                  onChange: (event) => suggestLotCode(event.target.value),
                })}
              >
                <option value="">Selecciona…</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.productName} · {PRESENTATION_LABEL[variant.presentation]}{" "}
                    ({variant.sku})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="lotCode"
            label="Código de lote"
            hint="Se sugiere al elegir el producto; puedes cambiarlo"
            error={errors.lotCode?.message}
            required
          >
            {(props) => (
              <Input {...props} {...register("lotCode")} placeholder="L-20260901-MANGO-K" />
            )}
          </Field>

          <Field
            id="quantity"
            label="Cantidad producida"
            hint="En unidades de la presentación elegida"
            error={errors.quantity?.message}
            required
          >
            {(props) => (
              <Input
                {...props}
                {...register("quantity")}
                type="number"
                min={0}
                step="0.001"
              />
            )}
          </Field>

          <Field
            id="productionDate"
            label="Fecha de producción"
            error={errors.productionDate?.message}
            required
          >
            {(props) => (
              <Input
                {...props}
                {...register("productionDate", {
                  onChange: (event) => suggestLotCode(variantId, event.target.value),
                })}
                type="date"
              />
            )}
          </Field>

          <Field
            id="expiryDate"
            label="Fecha de vencimiento"
            hint={`Precargada a ${DEFAULT_SHELF_LIFE_MONTHS} meses; ajústala al lote real`}
            error={errors.expiryDate?.message}
            required
          >
            {(props) => <Input {...props} {...register("expiryDate")} type="date" />}
          </Field>

          <Field
            id="notes"
            label="Notas"
            error={errors.notes?.message}
            className="sm:col-span-2"
          >
            {(props) => (
              <Textarea
                {...props}
                {...register("notes")}
                rows={2}
                placeholder="Proveedor de la fruta, observaciones de calidad…"
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          El lote entra al inventario disponible y se despachará por orden de
          vencimiento.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Registrando…" : "Registrar lote"}
          </Button>
        </div>
      </div>
    </form>
  );
}
