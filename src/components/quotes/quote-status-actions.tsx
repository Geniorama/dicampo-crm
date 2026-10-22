"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { nextQuoteStatuses } from "@/lib/quote-rules";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import type { QuoteStatus } from "@/generated/prisma/enums";

/**
 * Acciones de una cotización. Las transiciones salen de la misma tabla que
 * usa el servidor. "Aceptar" no es un cambio de estado: convierte la
 * cotización en pedido.
 */
export function QuoteStatusActions({
  quoteId,
  status,
  canConvert,
}: {
  quoteId: string;
  status: QuoteStatus;
  /** La cotización sigue viva y todavía no tiene pedido. */
  canConvert: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reason, setReason] = useState("");

  // ACEPTADA y VENCIDA no se piden a mano: una sale de convertir, la otra del paso del tiempo.
  const transitions = nextQuoteStatuses(status).filter(
    (next) => next !== "ACEPTADA" && next !== "VENCIDA",
  );

  if (transitions.length === 0 && !canConvert) return null;

  async function changeStatus(next: QuoteStatus, rejectReason?: string) {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/cotizaciones/${quoteId}/estado`, {
        status: next,
        reason: rejectReason,
      });
      setIsRejecting(false);
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

  async function convert() {
    setError(null);
    setBusy(true);
    try {
      const order = await api.post<{ id: string }>(
        `/api/cotizaciones/${quoteId}/convertir`,
        {},
      );
      router.push(`/pedidos/${order.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : "No se pudo crear el pedido.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {transitions.includes("ENVIADA") && (
          <Button size="sm" disabled={busy} onClick={() => changeStatus("ENVIADA")}>
            {status === "VENCIDA" ? "Reenviar" : "Marcar enviada"}
          </Button>
        )}

        {canConvert && (
          <Button size="sm" disabled={busy} onClick={convert}>
            Aceptar y crear pedido
          </Button>
        )}

        {transitions.includes("RECHAZADA") && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setIsRejecting(true)}
          >
            Rechazada
          </Button>
        )}
      </div>

      {isRejecting && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Field id="rejectReason" label="Motivo del rechazo" required>
            {(props) => (
              <Textarea
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Precio, ya tiene proveedor, no responde…"
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || reason.trim() === ""}
              onClick={() => changeStatus("RECHAZADA", reason)}
            >
              Confirmar rechazo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setIsRejecting(false)}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
