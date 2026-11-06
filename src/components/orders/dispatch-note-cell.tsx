"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** Observación de despacho de un pedido (incompleto, no enviado…), editable en la fila. */
export function DispatchNoteCell({ orderId, note }: { orderId: string; note: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/api/pedidos/${orderId}/despacho`, { dispatchNote: text });
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-muted-foreground hover:text-foreground"
        aria-label="Editar observaciones"
      >
        {note ?? <span className="text-xs text-primary">Agregar</span>}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        aria-label="Observaciones del pedido"
        value={text}
        maxLength={500}
        onChange={(event) => setText(event.target.value)}
        placeholder="Incompleto, no enviado…"
      />
      <div className="flex gap-1">
        <Button size="sm" disabled={saving} onClick={save}>
          {saving ? "…" : "Guardar"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
