"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { nextStatuses } from "@/lib/order-math";
import { ORDER_STATUS_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Botones para avanzar el pedido en su ciclo de vida. Las transiciones válidas
 * salen de la misma tabla que usa el servidor, así que la interfaz nunca
 * ofrece un paso que la API vaya a rechazar.
 */
export function OrderStatusActions({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const available = nextStatuses(status);
  if (available.length === 0) return null;

  async function changeStatus(next: OrderStatus, reason?: string) {
    setError(null);
    setPending(next);

    try {
      await api.post(`/api/pedidos/${orderId}/estado`, { status: next, reason });
      setIsCancelling(false);
      setCancelReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo cambiar el estado del pedido.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {available.map((next) => {
          const isCancel = next === "CANCELADO";

          return (
            <Button
              key={next}
              variant={isCancel ? "secondary" : "primary"}
              size="sm"
              disabled={pending !== null}
              onClick={() =>
                // Cancelar exige motivo: se abre el campo en vez de enviar ya.
                isCancel ? setIsCancelling(true) : changeStatus(next)
              }
            >
              {pending === next
                ? "Procesando…"
                : isCancel
                  ? "Cancelar pedido"
                  : `Marcar ${ORDER_STATUS_LABEL[next].toLowerCase()}`}
            </Button>
          );
        })}
      </div>

      {isCancelling && (
        <div className="space-y-2 rounded-md border border-border bg-muted p-3">
          <Field
            id="cancelReason"
            label="Motivo de la cancelación"
            required
            hint="Queda registrado en el pedido."
          >
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="El cliente reprogramó la entrega, no hay inventario…"
              />
            )}
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCancelling(false);
                setCancelReason("");
              }}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelReason.trim().length === 0 || pending !== null}
              onClick={() => changeStatus("CANCELADO", cancelReason.trim())}
            >
              Confirmar cancelación
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
