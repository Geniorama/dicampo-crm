"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { QUOTE_STATUS_LABEL } from "@/lib/labels";
import { nextQuoteStatuses } from "@/lib/quote-rules";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import type { QuoteStatus } from "@/generated/prisma/enums";

/**
 * Cambio de estado contable de la cotización. Solo lo ve un administrador y
 * las transiciones salen de la misma tabla que usa el servidor. Anular exige
 * motivo, cancela el pedido y devuelve el inventario.
 */
export function QuoteStatusActions({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const transitions = nextQuoteStatuses(status);
  if (transitions.length === 0) return null;

  async function changeStatus(next: QuoteStatus, voidReason?: string) {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/cotizaciones/${quoteId}/estado`, { status: next, reason: voidReason });
      setIsVoiding(false);
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo cambiar el estado de la cotización.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {transitions
          .filter((next) => next !== "ANULADO")
          .map((next) => (
            <Button key={next} size="sm" disabled={busy} onClick={() => changeStatus(next)}>
              Pasar a {QUOTE_STATUS_LABEL[next].toLowerCase()}
            </Button>
          ))}

        {transitions.includes("ANULADO") && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setIsVoiding(true)}>
            Anular
          </Button>
        )}
      </div>

      {isVoiding && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">
            Anular cancela el pedido y devuelve el inventario reservado.
          </p>
          <Field id="voidReason" label="Motivo de la anulación" required>
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Error de digitación, el cliente canceló…"
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || reason.trim() === ""}
              onClick={() => changeStatus("ANULADO", reason)}
            >
              Confirmar anulación
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsVoiding(false)}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
