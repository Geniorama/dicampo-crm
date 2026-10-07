"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCOP, formatCalendarDate, formatOrderNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type PlannableOrder = {
  id: string;
  orderNumber: number;
  total: number;
  requestedDeliveryDate: string | null;
  clientName: string;
  addressLabel: string | null;
  addressText: string | null;
  zoneName: string | null;
};

/**
 * Planeación del recorrido de una ruta.
 *
 * Se ordena con botones de subir y bajar en vez de arrastrar y soltar: el
 * despachador arma la ruta desde el móvil, donde arrastrar filas es incómodo,
 * y así funciona también con teclado.
 *
 * Los cambios se guardan de una vez al confirmar: reordenar es una decisión
 * completa sobre el recorrido, no una sucesión de altas y bajas.
 */
export function RoutePlanner({
  routeId,
  assigned,
  available,
  editable,
}: {
  routeId: string;
  assigned: PlannableOrder[];
  available: PlannableOrder[];
  /** Solo se puede replanear mientras la ruta esté en planeación. */
  editable: boolean;
}) {
  const router = useRouter();
  const [sequence, setSequence] = useState<PlannableOrder[]>(assigned);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const assignedIds = new Set(sequence.map((order) => order.id));
  const pool = available.filter((order) => !assignedIds.has(order.id));

  const isDirty =
    sequence.length !== assigned.length ||
    sequence.some((order, index) => assigned[index]?.id !== order.id);

  const total = sequence.reduce((acc, order) => acc + order.total, 0);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sequence.length) return;

    const next = [...sequence];
    [next[index], next[target]] = [next[target], next[index]];
    setSequence(next);
  }

  async function save() {
    setError(null);
    setIsSaving(true);
    try {
      await api.put(`/api/rutas/${routeId}/pedidos`, {
        orderIds: sequence.map((order) => order.id),
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo guardar el recorrido.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Recorrido ({sequence.length})</CardTitle>
          <span className="tabular text-xs text-muted-foreground">
            {formatCOP(total)}
          </span>
        </CardHeader>

        {sequence.length === 0 ? (
          <EmptyState
            title="La ruta está vacía"
            description="Añade pedidos desde la lista de la derecha."
          />
        ) : (
          <ol className="divide-y divide-border">
            {sequence.map((order, index) => (
              <li
                key={order.id}
                className="flex items-start justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-strong">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/pedidos/${order.id}`}
                      className="tabular text-sm font-medium text-primary hover:underline"
                    >
                      {formatOrderNumber(order.orderNumber)}
                    </Link>
                    <p className="truncate text-xs text-foreground">
                      {order.clientName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.addressText ?? "Sin dirección"}
                      {order.zoneName ? ` · ${order.zoneName}` : ""}
                    </p>
                  </div>
                </div>

                {editable && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir ${formatOrderNumber(order.orderNumber)}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar ${formatOrderNumber(order.orderNumber)}`}
                      disabled={index === sequence.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar ${formatOrderNumber(order.orderNumber)}`}
                      onClick={() =>
                        setSequence(sequence.filter((item) => item.id !== order.id))
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {isDirty ? "Hay cambios sin guardar" : "Recorrido guardado"}
            </p>
            <Button size="sm" disabled={!isDirty || isSaving} onClick={save}>
              {isSaving ? "Guardando…" : "Guardar recorrido"}
            </Button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mx-5 mb-4 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </Card>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Pedidos por despachar ({pool.length})</CardTitle>
          </CardHeader>

          {pool.length === 0 ? (
            <EmptyState
              title="No hay pedidos disponibles"
              description="Solo se pueden despachar pedidos confirmados que aún no estén en otra ruta."
            />
          ) : (
            <ul className="divide-y divide-border">
              {pool.map((order) => (
                <li
                  key={order.id}
                  className="flex items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="tabular text-sm font-medium text-foreground">
                      {formatOrderNumber(order.orderNumber)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {formatCOP(order.total)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-foreground">
                      {order.clientName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {order.zoneName ?? "Sin zona"}
                      {order.requestedDeliveryDate
                        ? ` · pide ${formatCalendarDate(order.requestedDeliveryDate)}`
                        : ""}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSequence([...sequence, order])}
                  >
                    <Plus aria-hidden="true" />
                    Añadir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
