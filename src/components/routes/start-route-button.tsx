"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/** Sale a ruta: despacha sus pedidos y empieza a contar el recorrido. */
export function StartRouteButton({ routeId }: { routeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/api/rutas/${routeId}/estado`, { status: "EN_RUTA" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo iniciar la ruta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="lg" className="h-12 w-full" disabled={busy} onClick={start}>
        <Play aria-hidden="true" />
        {busy ? "Iniciando…" : "Iniciar ruta"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
