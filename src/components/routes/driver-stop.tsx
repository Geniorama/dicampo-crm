"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Navigation, PackageCheck, Phone, XCircle } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { formatCOP } from "@/lib/format";
import { DELIVERY_FAIL_REASON_LABEL, PAYMENT_METHOD_LABEL, toOptions } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { DeliveryFailReason, PaymentMethod } from "@/generated/prisma/enums";

type Mode = "idle" | "deliver" | "fail";

export type DriverStopLinks = {
  maps: string | null;
  waze: string | null;
  phone: string | null;
};

/**
 * Acciones de una parada en el teléfono del repartidor: navegar, marcar que
 * llegó, entregar (con cobro y observaciones) o reportar que no se pudo.
 *
 * Las reglas las decide el servidor; aquí solo se muestran los pasos que
 * tienen sentido según el estado de la parada.
 */
export function DriverStopActions({
  orderId,
  arrived,
  balance,
  links,
}: {
  orderId: string;
  arrived: boolean;
  balance: number;
  links: DriverStopLinks;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Entrega
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedDoc, setReceivedDoc] = useState("");
  const [collect, setCollect] = useState(balance > 0);
  const [method, setMethod] = useState<PaymentMethod>("EFECTIVO");
  const [amount, setAmount] = useState(String(balance));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // No entrega
  const [reason, setReason] = useState<DeliveryFailReason>("CLIENTE_AUSENTE");

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
      setMode("idle");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function arrive() {
    return run(() => api.post(`/api/pedidos/${orderId}/llegada`, {}), "No se pudo marcar la llegada.");
  }

  function deliver() {
    if (receivedBy.trim().length < 3) {
      setError("Escribe el nombre de quien recibió.");
      return;
    }
    const paid = Number(amount);
    if (collect && (!Number.isFinite(paid) || paid <= 0)) {
      setError("Escribe cuánto te pagaron o desmarca el cobro.");
      return;
    }

    return run(
      () =>
        api.post(`/api/pedidos/${orderId}/entrega`, {
          receivedBy: receivedBy.trim(),
          receivedDoc: receivedDoc.trim() || undefined,
          notes: notes.trim() || undefined,
          payment: collect
            ? { amount: paid, method, reference: reference.trim() || undefined }
            : undefined,
        }),
      "No se pudo registrar la entrega.",
    );
  }

  function fail() {
    return run(
      () => api.post(`/api/pedidos/${orderId}/no-entrega`, { reason, notes: notes.trim() || undefined }),
      "No se pudo registrar el intento.",
    );
  }

  const linkClass =
    "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-sm font-medium text-foreground hover:bg-muted";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {links.maps && (
          <a href={links.maps} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Navigation className="size-4" aria-hidden="true" />
            Maps
          </a>
        )}
        {links.waze && (
          <a href={links.waze} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <MapPin className="size-4" aria-hidden="true" />
            Waze
          </a>
        )}
        {links.phone && (
          <a href={links.phone} className={linkClass}>
            <Phone className="size-4" aria-hidden="true" />
            Llamar
          </a>
        )}
      </div>

      {mode === "idle" && (
        <div className="flex flex-col gap-2">
          {!arrived && (
            <Button type="button" size="lg" className="h-12 w-full" disabled={busy} onClick={arrive}>
              Llegué
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              variant={arrived ? "primary" : "secondary"}
              className="h-12 flex-1"
              onClick={() => setMode("deliver")}
            >
              <PackageCheck aria-hidden="true" />
              Entregar
            </Button>
            <Button
              type="button"
              size="lg"
              variant="secondary"
              className="h-12 flex-1"
              onClick={() => setMode("fail")}
            >
              <XCircle aria-hidden="true" />
              No entregué
            </Button>
          </div>
        </div>
      )}

      {mode === "deliver" && (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
          <Field id={`by-${orderId}`} label="¿Quién recibió?" required>
            {(props) => (
              <Input {...props} value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} />
            )}
          </Field>
          <Field id={`doc-${orderId}`} label="Documento de quien recibió (opcional)">
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={receivedDoc}
                onChange={(event) => setReceivedDoc(event.target.value)}
              />
            )}
          </Field>

          {balance > 0 && (
            <div className="space-y-3 rounded-md border border-border bg-card p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={collect}
                  onChange={(event) => setCollect(event.target.checked)}
                />
                Cobré en la entrega (saldo {formatCOP(balance)})
              </label>

              {collect && (
                <>
                  <Field id={`method-${orderId}`} label="Medio de pago">
                    {(props) => (
                      <Select
                        {...props}
                        value={method}
                        onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                      >
                        {toOptions(PAYMENT_METHOD_LABEL).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field id={`amount-${orderId}`} label="Valor recibido">
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="numeric"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                      />
                    )}
                  </Field>
                  {method !== "EFECTIVO" && (
                    <Field id={`ref-${orderId}`} label="Referencia (opcional)">
                      {(props) => (
                        <Input {...props} value={reference} onChange={(event) => setReference(event.target.value)} />
                      )}
                    </Field>
                  )}
                </>
              )}
            </div>
          )}

          <Field id={`notes-${orderId}`} label="Observaciones de la entrega (opcional)">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </Field>

          <div className="flex gap-2">
            <Button type="button" className="h-12 flex-1" disabled={busy} onClick={deliver}>
              {busy ? "Guardando…" : "Confirmar entrega"}
            </Button>
            <Button type="button" variant="secondary" className="h-12" disabled={busy} onClick={() => setMode("idle")}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {mode === "fail" && (
        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
          <Field id={`reason-${orderId}`} label="¿Qué pasó?" required>
            {(props) => (
              <Select
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value as DeliveryFailReason)}
              >
                {toOptions(DELIVERY_FAIL_REASON_LABEL).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id={`fnotes-${orderId}`} label="Observaciones (opcional)">
            {(props) => (
              <Textarea
                {...props}
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
          </Field>
          <p className="text-xs text-muted-foreground">
            El pedido sale de tu ruta y vuelve a preparación para reprogramarlo.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" className="h-12 flex-1" disabled={busy} onClick={fail}>
              {busy ? "Guardando…" : "Confirmar que no se entregó"}
            </Button>
            <Button type="button" variant="secondary" className="h-12" disabled={busy} onClick={() => setMode("idle")}>
              Volver
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
