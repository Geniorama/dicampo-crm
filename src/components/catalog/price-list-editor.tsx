"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { PRESENTATION_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import type { Presentation } from "@/generated/prisma/enums";

export type PriceRow = {
  variantId: string;
  sku: string;
  productName: string;
  presentation: Presentation;
  /** Precio actual en la lista; null si la variante no lo tiene. */
  price: number | null;
};

export type PriceListChoice = { id: string; name: string; isDefault: boolean };

/**
 * Edición masiva de una lista de precios.
 *
 * Se guarda todo de una vez porque así es como se actualiza una lista en la
 * práctica: cuando sube el costo de la fruta se reajusta el catálogo entero,
 * no un sabor suelto. El ajuste porcentual precarga los valores, pero se
 * pueden corregir uno a uno antes de guardar.
 */
export function PriceListEditor({
  priceLists,
  activeListId,
  rows,
}: {
  priceLists: PriceListChoice[];
  activeListId: string;
  rows: PriceRow[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.variantId, row.price !== null ? String(row.price) : ""]),
    ),
  );
  const [percent, setPercent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /** Filas cuyo valor cambió respecto a lo guardado. */
  const changed = useMemo(
    () =>
      rows.filter((row) => {
        const draft = drafts[row.variantId];
        if (draft === undefined || draft === "") return false;
        return Number(draft) !== row.price;
      }),
    [rows, drafts],
  );

  /** Aplica un porcentaje sobre los precios actuales, redondeando a pesos. */
  function applyPercent() {
    const value = Number(percent);
    if (!Number.isFinite(value) || value === 0) {
      setError("Escribe un porcentaje distinto de cero.");
      return;
    }

    setError(null);
    setDrafts((current) => {
      const next = { ...current };
      for (const row of rows) {
        if (row.price === null) continue;
        // Se parte del precio guardado, no del borrador: aplicar dos veces
        // el mismo porcentaje no debe componerlo.
        next[row.variantId] = String(Math.round(row.price * (1 + value / 100)));
      }
      return next;
    });
  }

  async function save() {
    if (changed.length === 0) return;

    setError(null);
    setSaved(null);
    setIsSaving(true);

    try {
      const items = changed.map((row) => ({
        variantId: row.variantId,
        price: Number(drafts[row.variantId]),
        minQty: 1,
      }));

      const result = await api.patch<{ updated: number }>("/api/precios", {
        priceListId: activeListId,
        items,
      });

      setSaved(result.updated);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudieron guardar los precios.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Lista y ajuste general</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="priceList" label="Lista de precios">
            {(props) => (
              <Select
                {...props}
                value={activeListId}
                onChange={(event) =>
                  router.push(`/catalogo/precios?priceListId=${event.target.value}`)
                }
              >
                {priceLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                    {list.isDefault ? " (por defecto)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="percent"
            label="Ajuste porcentual"
            hint="Precarga los valores; revísalos antes de guardar"
          >
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  type="number"
                  step={0.5}
                  value={percent}
                  onChange={(event) => setPercent(event.target.value)}
                  placeholder="5 para subir 5 %, -3 para bajar"
                />
                <Button variant="secondary" onClick={applyPercent}>
                  Aplicar
                </Button>
              </div>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precios</CardTitle>
          <p className="text-xs text-muted-foreground">
            {changed.length === 0
              ? "Sin cambios pendientes"
              : `${changed.length} ${changed.length === 1 ? "precio modificado" : "precios modificados"}`}
          </p>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-medium">Producto</th>
                <th scope="col" className="px-5 py-2 font-medium">Presentación</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Actual</th>
                <th scope="col" className="px-5 py-2 font-medium">Nuevo</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Variación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const draft = drafts[row.variantId] ?? "";
                const next = draft === "" ? null : Number(draft);
                const delta =
                  row.price !== null && next !== null && row.price > 0
                    ? ((next - row.price) / row.price) * 100
                    : null;

                return (
                  <tr
                    key={row.variantId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-2">
                      <p className="font-medium text-foreground">{row.productName}</p>
                      <p className="text-xs text-muted-foreground">{row.sku}</p>
                    </td>
                    <td className="px-5 py-2 text-muted-foreground">
                      {PRESENTATION_LABEL[row.presentation]}
                    </td>
                    <td className="tabular px-5 py-2 text-right text-muted-foreground">
                      {row.price !== null ? formatCOP(row.price) : "—"}
                    </td>
                    <td className="px-5 py-2">
                      <Input
                        aria-label={`Precio de ${row.productName} ${PRESENTATION_LABEL[row.presentation]}`}
                        inputSize="sm"
                        type="number"
                        min={0}
                        step={100}
                        className="w-32"
                        value={draft}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [row.variantId]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td
                      className={`tabular px-5 py-2 text-right text-xs ${
                        delta === null || Math.abs(delta) < 0.005
                          ? "text-muted-foreground"
                          : delta > 0
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {delta === null || Math.abs(delta) < 0.005
                        ? "—"
                        : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} %`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {saved !== null && (
        <p
          role="status"
          className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {saved} {saved === 1 ? "precio guardado" : "precios guardados"}.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Los pedidos ya creados conservan el precio con el que se vendieron.
        </p>
        <Button
          onClick={save}
          disabled={changed.length === 0 || isSaving}
        >
          {isSaving
            ? "Guardando…"
            : `Guardar ${changed.length || ""} ${changed.length === 1 ? "cambio" : "cambios"}`.trim()}
        </Button>
      </div>
    </div>
  );
}
