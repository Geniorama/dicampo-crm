"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { ROUTE_STATUS_LABEL } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { RouteStatus } from "@/generated/prisma/enums";

/**
 * Avanza la ruta en su ciclo de vida. Las transiciones válidas las decide el
 * servidor; aquí se reciben ya resueltas para no ofrecer pasos que fallarían.
 */
export function RouteStatusActions({
  routeId,
  status,
  available,
}: {
  routeId: string;
  status: RouteStatus;
  available: RouteStatus[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<RouteStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  if (available.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        La ruta está {ROUTE_STATUS_LABEL[status].toLowerCase()}: ya no admite cambios.
      </p>
    );
  }

  async function change(next: RouteStatus, cancelReason?: string) {
    setError(null);
    setPending(next);
    try {
      await api.post(`/api/rutas/${routeId}/estado`, {
        status: next,
        reason: cancelReason,
      });
      setCancelling(false);
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo cambiar el estado de la ruta.",
      );
    } finally {
      setPending(null);
    }
  }

  const labelFor = (next: RouteStatus) =>
    next === "EN_RUTA"
      ? "Salir a ruta"
      : next === "COMPLETADA"
        ? "Cerrar ruta"
        : "Cancelar ruta";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {available.map((next) => (
          <Button
            key={next}
            variant={next === "CANCELADA" ? "secondary" : "primary"}
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              next === "CANCELADA" ? setCancelling(true) : change(next)
            }
          >
            {pending === next ? "Procesando…" : labelFor(next)}
          </Button>
        ))}
      </div>

      {cancelling && (
        <div className="space-y-2 rounded-md border border-border bg-muted p-3">
          <Field
            id="routeCancelReason"
            label="Motivo"
            required
            hint="Los pedidos vuelven a preparación para reprogramarlos."
          >
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Se dañó el vehículo, se reprogramó el reparto…"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={reason.trim().length < 3 || pending !== null}
              onClick={() => change("CANCELADA", reason.trim())}
            >
              Confirmar cancelación
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
