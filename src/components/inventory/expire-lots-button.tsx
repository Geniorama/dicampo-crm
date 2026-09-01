"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * Saca de la rotación FEFO los lotes cuya fecha ya pasó.
 *
 * Debería correr como tarea diaria; mientras tanto se dispara a mano desde
 * bodega, que es quien nota el vencimiento en la cámara.
 */
export function ExpireLotsButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setResult(null);
    setIsPending(true);
    try {
      const { expired } = await api.post<{ expired: number }>(
        "/api/inventario/vencidos",
      );
      setResult(
        expired === 0
          ? "No había lotes vencidos."
          : `${expired} ${expired === 1 ? "lote marcado" : "lotes marcados"} como vencidos.`,
      );
      router.refresh();
    } catch (error) {
      setResult(
        error instanceof ApiClientError ? error.message : "No se pudo revisar.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="text-right">
      <Button variant="secondary" disabled={isPending} onClick={run}>
        <CalendarX aria-hidden="true" />
        {isPending ? "Revisando…" : "Marcar vencidos"}
      </Button>
      {result && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          {result}
        </p>
      )}
    </div>
  );
}
