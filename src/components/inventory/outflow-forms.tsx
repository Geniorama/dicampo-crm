"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

export type VariantStockOption = {
  id: string;
  label: string;
  available: number;
  /** Lotes a los que puede reingresar una devolución vendible (vigentes, sin bloqueo). */
  lots: { id: string; lotCode: string; expiry: string }[];
};

type Mode = "muestra" | "devolucion";
type Condition = "VENDIBLE" | "DANADA";

/**
 * Salidas que no son venta: muestras gratis y devoluciones. Mueven el stock y
 * quedan en el kardex, pero no entran al margen: explican por qué salió (o
 * volvió) pulpa que no fue facturada.
 */
export function OutflowForms({ variants }: { variants: VariantStockOption[] }) {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("muestra");
  const [condition, setCondition] = useState<Condition>("VENDIBLE");
  const [variantId, setVariantId] = useState("");
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const variant = variants.find((item) => item.id === variantId);
  const qty = Number(quantity) || 0;
  const needsLot = mode === "devolucion" && condition === "VENDIBLE";
  const canSave = Boolean(variantId) && qty > 0 && (!needsLot || Boolean(lotId)) && !saving;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);

    try {
      if (mode === "muestra") {
        await api.post("/api/inventario/muestras", {
          variantId,
          quantity: qty,
          reason: reason || undefined,
        });
        setDone(`Muestra: −${qty} de ${variant?.label}`);
      } else {
        await api.post("/api/inventario/devoluciones", {
          variantId,
          quantity: qty,
          condition,
          lotId: needsLot ? lotId : undefined,
          reason: reason || undefined,
        });
        setDone(
          condition === "VENDIBLE"
            ? `Devolución vendible: +${qty} de ${variant?.label}`
            : `Devolución dañada: ${qty} de ${variant?.label} (no reingresa)`,
        );
      }
      setVariantId("");
      setLotId("");
      setQuantity("");
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={
        mode === value
          ? "rounded-md bg-primary-subtle px-3 py-1.5 text-sm font-medium text-primary-strong"
          : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
      }
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Muestra o devolución</CardTitle>
          <div className="flex gap-1">
            {tab("muestra", "Muestra gratis")}
            {tab("devolucion", "Devolución")}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="variantId" label="Producto" required className="sm:col-span-2">
            {(props) => (
              <Select
                {...props}
                value={variantId}
                onChange={(event) => {
                  setVariantId(event.target.value);
                  setLotId("");
                }}
              >
                <option value="">Selecciona…</option>
                {variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.available} disponibles
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {mode === "devolucion" && (
            <Field id="condition" label="¿En qué estado vuelve?">
              {(props) => (
                <Select
                  {...props}
                  value={condition}
                  onChange={(event) => setCondition(event.target.value as Condition)}
                >
                  <option value="VENDIBLE">Vendible (reingresa)</option>
                  <option value="DANADA">Dañado (se pierde)</option>
                </Select>
              )}
            </Field>
          )}

          {needsLot && (
            <Field
              id="lotId"
              label="Lote al que reingresa"
              hint={variant && variant.lots.length === 0 ? "No hay lotes vigentes de este producto" : undefined}
            >
              {(props) => (
                <Select
                  {...props}
                  value={lotId}
                  disabled={!variant}
                  onChange={(event) => setLotId(event.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {variant?.lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lotCode} · vence {lot.expiry}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field id="quantity" label={mode === "muestra" ? "Cantidad entregada" : "Cantidad devuelta"} required>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            )}
          </Field>

          <Field id="reason" label="Motivo o cliente">
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={mode === "muestra" ? "Muestra a Café Pura Vida" : "Llegó descongelada"}
              />
            )}
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive sm:col-span-2"
            >
              {error}
            </p>
          )}
          {done && (
            <p
              role="status"
              className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success sm:col-span-2"
            >
              {done}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={!canSave}>
              {saving ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
