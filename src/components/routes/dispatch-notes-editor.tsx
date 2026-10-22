"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/**
 * Observaciones para el repartidor: qué cobrar en la entrega y qué obsequio
 * lleva el pedido. Se guardan aparte del resto del pedido para poder
 * ajustarlas hasta el último momento, aun con el pedido ya confirmado.
 */
export function DispatchNotesEditor({
  orderId,
  collectionNote,
  giftNote,
  orderNumber,
}: {
  orderId: string;
  collectionNote: string | null;
  giftNote: string | null;
  orderNumber: number;
}) {
  const router = useRouter();
  const [collection, setCollection] = useState(collectionNote ?? "");
  const [gift, setGift] = useState(giftNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = collection !== (collectionNote ?? "") || gift !== (giftNote ?? "");

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/api/pedidos/${orderId}/despacho`, {
        collectionNote: collection,
        giftNote: gift,
      });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : "No se pudieron guardar las observaciones.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label={`Cobro del pedido ${orderNumber}`}
          value={collection}
          maxLength={500}
          onChange={(event) => setCollection(event.target.value)}
          placeholder="Cobrar: saldo $120.000 en efectivo…"
        />
        <Input
          aria-label={`Obsequio del pedido ${orderNumber}`}
          value={gift}
          maxLength={500}
          onChange={(event) => setGift(event.target.value)}
          placeholder="Obsequio: 1 kg de mora…"
        />
      </div>

      {(dirty || error) && (
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? "Guardando…" : "Guardar observaciones"}
            </Button>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
