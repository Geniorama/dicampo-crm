"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ApiClientError } from "@/lib/api-client";
import { Select } from "@/components/ui/field";
import { formatBogotaDateTime } from "@/lib/format";

const OPTIONS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "LLAMADA", label: "Llamada" },
  { value: "VISITA", label: "Visita" },
] as const;

type Last = { type: string; createdAt: string } | null;

/**
 * Lista desplegable para registrar la gestión del día con un cliente.
 * Crea una actividad ya realizada en la bitácora (`POST /api/actividades`).
 */
export function ManagementSelect({
  clientId,
  clientName,
  last,
}: {
  clientId: string;
  clientName: string;
  last: Last;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function register(type: string) {
    if (!type) return;
    const label = OPTIONS.find((option) => option.value === type)?.label ?? type;
    setError(null);
    try {
      await api.post("/api/actividades", {
        type,
        subject: `${label} con ${clientName}`.slice(0, 200),
        clientId,
        completed: true,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "No se pudo registrar.");
    }
  }

  const lastLabel = last
    ? `${OPTIONS.find((option) => option.value === last.type)?.label ?? last.type} · ${formatBogotaDateTime(last.createdAt)}`
    : "Sin gestión";

  return (
    <div className="min-w-40">
      <Select
        aria-label={`Registrar gestión con ${clientName}`}
        value=""
        disabled={pending}
        onChange={(event) => register(event.target.value)}
      >
        <option value="">Registrar gestión…</option>
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p className="mt-0.5 text-xs text-muted-foreground">{lastLabel}</p>
      {error && (
        <p role="alert" className="mt-0.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
