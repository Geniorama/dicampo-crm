"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import {
  DEFAULT_SHELF_LIFE_DAYS,
  addDaysToDateString,
  batchBreakdown,
} from "@/lib/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type ProductOption = { id: string; name: string; expectedYieldPct: number | null };

/**
 * Registro de una tanda de producción. El desperdicio se calcula solo —fruta
 * menos pulpa— para que nadie lo digite: es el dato que más se presta a
 * errores y el que más interesa vigilar.
 */
export function ProductionForm({
  products,
  today,
}: {
  products: ProductOption[];
  /** "AAAA-MM-DD" de hoy en Bogotá. */
  today: string;
}) {
  const router = useRouter();

  const [productId, setProductId] = useState("");
  const [date, setDate] = useState(today);
  const [expiryDate, setExpiryDate] = useState(addDaysToDateString(today, DEFAULT_SHELF_LIFE_DAYS));
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [fruitKg, setFruitKg] = useState("");
  const [publicKg, setPublicKg] = useState("");
  const [bulkKg, setBulkKg] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const fruit = Number(fruitKg) || 0;
  const pub = Number(publicKg) || 0;
  const bulk = Number(bulkKg) || 0;
  const breakdown = useMemo(() => batchBreakdown(fruit, pub, bulk), [fruit, pub, bulk]);
  const product = products.find((item) => item.id === productId);

  const canSave =
    Boolean(productId) && fruit > 0 && breakdown.pulpKg > 0 && !breakdown.exceedsFruit && !saving;

  function changeDate(next: string) {
    setDate(next);
    // El vencimiento acompaña a la fecha mientras nadie lo haya tocado a mano.
    if (!expiryTouched && next) setExpiryDate(addDaysToDateString(next, DEFAULT_SHELF_LIFE_DAYS));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);

    try {
      await api.post("/api/produccion", {
        productId,
        date,
        fruitKg: fruit,
        publicKg: pub,
        bulkKg: bulk,
        expiryDate: pub > 0 ? expiryDate : undefined,
        notes: notes || undefined,
      });
      setDone(`${product?.name}: +${pub} kg de pulpa pública, ${bulk} kg a granel.`);
      setProductId("");
      setFruitKg("");
      setPublicKg("");
      setBulkKg("");
      setNotes("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo registrar la tanda.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Registrar tanda</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="productId" label="Fruta / producto" required className="sm:col-span-2">
            {(props) => (
              <Select {...props} value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">Selecciona…</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="date" label="Fecha de producción" required>
            {(props) => (
              <Input {...props} type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
            )}
          </Field>

          <Field id="fruitKg" label="Kilos de fruta recibidos" required>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={fruitKg}
                onChange={(event) => setFruitKg(event.target.value)}
              />
            )}
          </Field>

          <Field id="publicKg" label="Pulpa pública (kg)" hint="Se vende: entra como lote">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={publicKg}
                onChange={(event) => setPublicKg(event.target.value)}
              />
            )}
          </Field>

          <Field id="bulkKg" label="Pulpa a granel (kg)" hint="Se contabiliza; no entra al catálogo">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={bulkKg}
                onChange={(event) => setBulkKg(event.target.value)}
              />
            )}
          </Field>

          {pub > 0 && (
            <Field
              id="expiryDate"
              label="Vence el lote"
              hint={`Se propone ${DEFAULT_SHELF_LIFE_DAYS} días; ajústalo a la vida útil real`}
              className="sm:col-span-2"
            >
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={expiryDate}
                  onChange={(event) => {
                    setExpiryTouched(true);
                    setExpiryDate(event.target.value);
                  }}
                />
              )}
            </Field>
          )}

          <Field id="notes" label="Notas" className="sm:col-span-2">
            {(props) => (
              <Textarea {...props} value={notes} onChange={(event) => setNotes(event.target.value)} />
            )}
          </Field>

          {fruit > 0 && (
            <dl className="space-y-1 rounded-md bg-muted px-4 py-3 text-sm sm:col-span-2">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pulpa total</dt>
                <dd className="tabular font-medium">{breakdown.pulpKg} kg</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Rendimiento</dt>
                <dd className="tabular font-medium">
                  {breakdown.yieldPct}%
                  {product?.expectedYieldPct != null && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      esperado {product.expectedYieldPct}%
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Desperdicio</dt>
                <dd className="tabular font-medium text-destructive">
                  {breakdown.wasteKg} kg ({breakdown.wastePct}%)
                </dd>
              </div>
              {breakdown.exceedsFruit && (
                <p role="alert" className="pt-1 text-destructive">
                  La pulpa supera los kilos de fruta recibidos.
                </p>
              )}
            </dl>
          )}

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
              {saving ? "Registrando…" : "Registrar tanda"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
