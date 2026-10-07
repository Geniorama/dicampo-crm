"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la pantalla al día sin recargar a ciegas.
 *
 * Con `versionUrl`, consulta una huella liviana y solo refresca cuando cambió:
 * volver a renderizar el chat re-firma los archivos y cortaría un audio que
 * se está escuchando. Sin ella, refresca cada `intervalMs`. Se pausa con la
 * pestaña oculta.
 */
export function AutoRefresh({
  versionUrl,
  intervalMs = 10_000,
}: {
  versionUrl?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const lastVersion = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (document.hidden) return;
      if (!versionUrl) {
        router.refresh();
        return;
      }
      try {
        const response = await fetch(versionUrl, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: { version?: string } };
        const version = payload.data?.version ?? null;
        if (cancelled || !version) return;
        if (lastVersion.current !== null && version !== lastVersion.current) {
          router.refresh();
        }
        lastVersion.current = version;
      } catch {
        // Sin red: se reintenta en el siguiente ciclo.
      }
    }

    void tick();
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router, versionUrl, intervalMs]);

  return null;
}
