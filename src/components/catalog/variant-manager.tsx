"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { PRESENTATION_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import type { Presentation } from "@/generated/prisma/enums";

export type VariantRow = {
  id: string;
  sku: string;
  presentation: Presentation;
  active: boolean;
  /** Precio en la lista por defecto; null si no lo tiene. */
  price: number | null;
};

/**
 * Presentaciones y precios de un producto.
 *
 * Las variantes no se borran: se desactivan. Los pedidos históricos apuntan a
 * ellas y perderlas rompería el historial de ventas.
 */
export function VariantManager({
  productId,
  variants,
  priceListId,
  priceListName,
  canEdit,
}: {
  productId: string;
  variants: VariantRow[];
  priceListId: string | null;
  priceListName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Alta de variante
  const [presentation, setPresentation] = useState<Presentation>("KILO");
  const [newPrice, setNewPrice] = useState("");

  // Edición de precio en línea
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const usedPresentations = new Set(variants.map((v) => v.presentation));
  const availablePresentations = (["KILO", "LIBRA"] as const).filter(
    (p) => !usedPresentations.has(p),
  );

  async function run(id: string, fn: () => Promise<unknown>) {
    setError(null);
    setPendingId(id);
    try {
      await fn();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function savePrice(variantId: string) {
    if (!priceListId) return;
    const value = Number(priceDraft);
    if (!Number.isFinite(value) || value < 0) {
      setError("El precio debe ser un número mayor o igual a cero.");
      return;
    }

    await run(variantId, async () => {
      await api.patch("/api/precios", {
        priceListId,
        items: [{ variantId, price: value, minQty: 1 }],
      });
      setEditingPriceId(null);
      setPriceDraft("");
    });
  }

  return (
    <div className="space-y-3">
      {variants.length === 0 ? (
        <EmptyState
          title="Sin presentaciones"
          description="Añade al menos una presentación con su precio para poder venderlo."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-medium">Presentación</th>
                <th scope="col" className="px-5 py-2 font-medium">SKU</th>
                <th scope="col" className="px-5 py-2 font-medium">
                  Precio{priceListName ? ` · ${priceListName}` : ""}
                </th>
                <th scope="col" className="px-5 py-2 font-medium">Estado</th>
                {canEdit && (
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5 font-medium text-foreground">
                    {PRESENTATION_LABEL[variant.presentation]}
                  </td>
                  <td className="px-5 py-2.5 text-muted-foreground">
                    {variant.sku}
                  </td>

                  <td className="px-5 py-2.5">
                    {editingPriceId === variant.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`Precio de ${PRESENTATION_LABEL[variant.presentation]}`}
                          inputSize="sm"
                          type="number"
                          min={0}
                          step={100}
                          className="w-28"
                          value={priceDraft}
                          onChange={(event) => setPriceDraft(event.target.value)}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          disabled={pendingId === variant.id}
                          onClick={() => savePrice(variant.id)}
                        >
                          Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingPriceId(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <span className="tabular text-foreground">
                        {variant.price !== null
                          ? formatCOP(variant.price)
                          : "Sin precio"}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-2.5">
                    <Badge tone={variant.active ? "success" : "neutral"}>
                      {variant.active ? "Activa" : "Inactiva"}
                    </Badge>
                  </td>

                  {canEdit && (
                    <td className="px-5 py-2.5">
                      <div className="flex justify-end gap-2">
                        {editingPriceId !== variant.id && priceListId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingPriceId(variant.id);
                              setPriceDraft(
                                variant.price !== null ? String(variant.price) : "",
                              );
                            }}
                          >
                            Editar precio
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={pendingId === variant.id}
                          onClick={() =>
                            run(variant.id, () =>
                              api.patch(`/api/catalogo/variantes/${variant.id}`, {
                                active: !variant.active,
                              }),
                            )
                          }
                        >
                          {variant.active ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="px-5 pb-4">
          {availablePresentations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              El producto ya tiene sus dos presentaciones.
            </p>
          ) : adding ? (
            <div className="space-y-3 rounded-md border border-border bg-muted p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="newPresentation" label="Presentación">
                  {(props) => (
                    <Select
                      {...props}
                      value={presentation}
                      onChange={(event) =>
                        setPresentation(event.target.value as Presentation)
                      }
                    >
                      {availablePresentations.map((option) => (
                        <option key={option} value={option}>
                          {PRESENTATION_LABEL[option]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  id="newPrice"
                  label="Precio (COP)"
                  hint="Se registra en la lista por defecto"
                >
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      min={0}
                      step={100}
                      value={newPrice}
                      onChange={(event) => setNewPrice(event.target.value)}
                    />
                  )}
                </Field>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={pendingId === "new"}
                  onClick={() =>
                    run("new", async () => {
                      await api.post(
                        `/api/catalogo/productos/${productId}/variantes`,
                        {
                          presentation,
                          // El SKU se genera solo a partir del sabor.
                          price: newPrice === "" ? undefined : Number(newPrice),
                        },
                      );
                      setAdding(false);
                      setNewPrice("");
                    })
                  }
                >
                  Añadir presentación
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAdding(true);
                setPresentation(availablePresentations[0]);
              }}
            >
              <Plus aria-hidden="true" />
              Añadir presentación
            </Button>
          )}
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
