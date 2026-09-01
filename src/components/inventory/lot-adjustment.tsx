"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { formatQuantity } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { StockMovementType } from "@/generated/prisma/enums";

/**
 * Ajuste manual sobre un lote.
 *
 * Solo se ofrecen AJUSTE y MERMA: las salidas por venta y las devoluciones las
 * genera el flujo de pedidos, no una persona — tecleadas a mano descuadrarían
 * el kardex contra los pedidos.
 *
 * La cantidad se pide en positivo y el signo lo decide el tipo de operación,
 * que es como se piensa en bodega: "se dañaron 5", no "menos cinco".
 */
export function LotAdjustment({
  lotId,
  lotCode,
  available,
}: {
  lotId: string;
  lotCode: string;
  available: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [operation, setOperation] = useState<"MERMA" | "ENTRADA" | "SALIDA">("MERMA");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const magnitude = Number(amount);
  const isValidAmount = Number.isFinite(magnitude) && magnitude > 0;
  const removes = operation !== "ENTRADA";
  const wouldLeave = available + (removes ? -magnitude : magnitude);

  async function save() {
    setError(null);

    if (!isValidAmount) {
      setError("La cantidad debe ser mayor que cero.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Explica el motivo del ajuste.");
      return;
    }
    if (wouldLeave < 0) {
      setError(
        `No puedes descontar ${formatQuantity(magnitude)}: el lote solo tiene ${formatQuantity(available)}.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      const type: StockMovementType = operation === "MERMA" ? "MERMA" : "AJUSTE";
      await api.post("/api/inventario/ajustes", {
        lotId,
        type,
        quantity: removes ? -magnitude : magnitude,
        reason: reason.trim(),
      });

      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo registrar el ajuste.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden="true" />
        Ajustar
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted p-3 text-left">
      <p className="text-xs font-medium text-foreground">
        Ajustar lote {lotCode} · saldo {formatQuantity(available)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`op-${lotId}`} label="Operación">
          {(props) => (
            <Select
              {...props}
              value={operation}
              onChange={(event) =>
                setOperation(event.target.value as typeof operation)
              }
            >
              <option value="MERMA">Merma — producto dañado o vencido</option>
              <option value="SALIDA">Ajuste — descontar por conteo</option>
              <option value="ENTRADA">Ajuste — añadir por conteo</option>
            </Select>
          )}
        </Field>

        <Field
          id={`amount-${lotId}`}
          label="Cantidad"
          hint={
            isValidAmount
              ? `El lote quedaría en ${formatQuantity(wouldLeave)}`
              : "Siempre en positivo"
          }
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              step="0.001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          )}
        </Field>
      </div>

      <Field
        id={`reason-${lotId}`}
        label="Motivo"
        hint="Queda en el kardex como auditoría"
        required
      >
        {(props) => (
          <Input
            {...props}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Rotura de cadena de frío, conteo físico, empaque roto…"
          />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button
          size="sm"
          variant={removes ? "destructive" : "primary"}
          disabled={isSaving}
          onClick={save}
        >
          {isSaving ? "Guardando…" : "Registrar ajuste"}
        </Button>
      </div>
    </div>
  );
}
