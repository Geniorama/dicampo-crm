"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { EXCIPIENT_RATE, purchaseCost } from "@/lib/production";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

/**
 * Registro de una compra de fruta. Muestra el costo con el recargo de
 * excipientes tal como lo guardará el servidor, para que quien compra vea la
 * cifra que entra a la rentabilidad.
 */
export function PurchaseForm({
  fruits,
  today,
}: {
  fruits: readonly string[];
  /** "AAAA-MM-DD" de hoy en Bogotá. */
  today: string;
}) {
  const router = useRouter();

  const [date, setDate] = useState(today);
  const [fruit, setFruit] = useState("");
  const [supplier, setSupplier] = useState("");
  const [kg, setKg] = useState("");
  const [baseCost, setBaseCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kilos = Number(kg) || 0;
  const base = Number(baseCost) || 0;
  const withExcipients = base > 0 ? purchaseCost(base) : 0;
  const canSave = Boolean(date && fruit.trim() && supplier.trim() && kilos > 0 && base > 0) && !saving;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    setSaving(true);

    try {
      await api.post("/api/compras", { date, fruit, supplier, kg: kilos, baseCost: base });
      setDone(`${fruit}: ${kilos.toLocaleString("es-CO")} kg de ${supplier}`);
      setFruit("");
      setSupplier("");
      setKg("");
      setBaseCost("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Registrar nueva compra</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="date" label="Fecha" required>
            {(props) => (
              <Input {...props} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            )}
          </Field>

          <Field id="fruit" label="Fruta" required>
            {(props) => (
              <>
                <Input
                  {...props}
                  list="fruits-list"
                  value={fruit}
                  onChange={(event) => setFruit(event.target.value)}
                  placeholder="Mango"
                />
                <datalist id="fruits-list">
                  {fruits.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
          </Field>

          <Field id="supplier" label="Proveedor" required className="sm:col-span-2">
            {(props) => (
              <Input {...props} value={supplier} onChange={(event) => setSupplier(event.target.value)} />
            )}
          </Field>

          <Field id="kg" label="Kilos del lote" required>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={kg}
                onChange={(event) => setKg(event.target.value)}
              />
            )}
          </Field>

          <Field id="baseCost" label="Costo del lote (COP)" required>
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={baseCost}
                onChange={(event) => setBaseCost(event.target.value)}
              />
            )}
          </Field>

          {withExcipients > 0 && (
            <dl className="space-y-1 rounded-md bg-muted px-4 py-3 text-sm sm:col-span-2">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Costo del lote</dt>
                <dd className="tabular font-medium">{formatCOP(base)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">+ {EXCIPIENT_RATE * 100}% excipientes</dt>
                <dd className="tabular font-medium">{formatCOP(withExcipients - base)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Costo de materia prima</dt>
                <dd className="tabular">{formatCOP(withExcipients)}</dd>
              </div>
              {kilos > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Costo por kilo</dt>
                  <dd className="tabular font-medium">{formatCOP(Math.round(withExcipients / kilos))}</dd>
                </div>
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
              {saving ? "Registrando…" : "Registrar compra"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
