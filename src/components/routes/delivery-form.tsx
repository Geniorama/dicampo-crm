"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * Registro de entrega de un pedido.
 *
 * Pide quién recibió porque es lo que sostiene la remisión si el cliente luego
 * reclama. La foto de la remisión firmada llegará cuando esté R2.
 */
export function DeliveryForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedDoc, setReceivedDoc] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    setError(null);

    if (receivedBy.trim().length < 3) {
      setError("Escribe el nombre de quien recibió.");
      return;
    }

    setIsSaving(true);
    try {
      await api.post(`/api/pedidos/${orderId}/entrega`, {
        receivedBy: receivedBy.trim(),
        receivedDoc: receivedDoc.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo registrar la entrega.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <PackageCheck aria-hidden="true" />
        Registrar entrega
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-md border border-border bg-muted p-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`rb-${orderId}`} label="Recibido por" required>
          {(props) => (
            <Input
              {...props}
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Nombre de quien recibe"
              autoFocus
            />
          )}
        </Field>
        <Field id={`rd-${orderId}`} label="Documento">
          {(props) => (
            <Input
              {...props}
              value={receivedDoc}
              onChange={(e) => setReceivedDoc(e.target.value)}
              placeholder="Cédula, opcional"
            />
          )}
        </Field>
      </div>

      <Field id={`rn-${orderId}`} label="Observaciones">
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Faltantes, novedades de la entrega…"
          />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button size="sm" disabled={isSaving} onClick={save}>
          {isSaving ? "Guardando…" : "Confirmar entrega"}
        </Button>
      </div>
    </div>
  );
}
