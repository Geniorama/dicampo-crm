"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { PaymentMethod } from "@/generated/prisma/enums";

const methodOptions = toOptions(PAYMENT_METHOD_LABEL);

/**
 * Registro de un abono. Se propone el saldo completo (lo más común es que el
 * cliente pague todo) y el servidor rechaza cualquier valor que lo supere.
 */
export function PaymentForm({
  orderId,
  orderNumber,
  balance,
}: {
  orderId: string;
  orderNumber: string;
  balance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = Number(amount) || 0;
  const canSave = value > 0 && value <= balance && !saving;

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/pedidos/${orderId}/pagos`, {
        amount: value,
        method,
        reference: reference || undefined,
      });
      setOpen(false);
      setReference("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setAmount(String(balance));
          setOpen(true);
        }}
      >
        Registrar pago
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">
        {orderNumber} · saldo {formatCOP(balance)}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          aria-label={`Valor del pago de ${orderNumber}`}
          type="number"
          min={0}
          max={balance}
          step={1000}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <Select
          aria-label={`Medio de pago de ${orderNumber}`}
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
        >
          {methodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label={`Referencia del pago de ${orderNumber}`}
          value={reference}
          maxLength={120}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Referencia (opcional)"
        />
      </div>

      {value > balance && (
        <p role="alert" className="text-xs text-destructive">
          El valor supera el saldo del pedido.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" disabled={!canSave} onClick={save}>
          {saving ? "Guardando…" : "Guardar pago"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
