"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Hora de la última recarga automática. Si el fragmento sigue fallando justo
 * después de recargar, no se insiste: se muestra el botón para no entrar en
 * un bucle.
 */
const CHUNK_RELOAD_KEY = "crm:chunk-reload";
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/**
 * Tras un despliegue, una pestaña abierta puede pedir un fragmento de JS que
 * ya no existe o que falló en una red móvil. `reset()` no lo vuelve a
 * descargar: hace falta recargar la página.
 */
function isChunkLoadError(error: Error): boolean {
  return error.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w-]+ failed/i.test(error.message);
}

/**
 * Límite de error del área privada. Muestra un mensaje entendible en vez de
 * la traza técnica; los errores de dominio (permisos, reglas de negocio) ya
 * traen un mensaje redactado para el usuario.
 */
export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    console.error("[crm]", error);
    if (!chunkError) return;
    try {
      const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
      if (last && Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error, chunkError]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        No pudimos cargar esta sección
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {chunkError
          ? "Hay una versión nueva del CRM o se cortó la conexión. Recarga la página para continuar."
          : error.message || "Ocurrió un error inesperado."}
      </p>
      <Button
        className="mt-5"
        onClick={() => {
          if (!chunkError) return reset();
          try {
            sessionStorage.removeItem(CHUNK_RELOAD_KEY);
          } catch {}
          window.location.reload();
        }}
      >
        {chunkError ? "Recargar" : "Reintentar"}
      </Button>
    </div>
  );
}
