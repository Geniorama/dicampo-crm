"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/** Marca una actividad pendiente como realizada. */
export function CompleteActivityButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setError(null);
    setIsPending(true);
    try {
      await api.post(`/api/actividades/${activityId}/completar`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo completar.",
      );
      setIsPending(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <Button variant="secondary" size="sm" disabled={isPending} onClick={complete}>
        <Check aria-hidden="true" />
        {isPending ? "Guardando…" : "Hecho"}
      </Button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
