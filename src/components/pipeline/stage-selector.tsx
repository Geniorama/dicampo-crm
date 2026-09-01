"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { ALL_STAGES } from "@/lib/pipeline-stages";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { OpportunityStage } from "@/generated/prisma/enums";

/**
 * Mueve una oportunidad de etapa.
 *
 * Se usa un `<select>` en vez de arrastrar y soltar: funciona con teclado y
 * con lector de pantalla, y en móvil —donde el vendedor actualiza el pipeline
 * después de una visita— arrastrar entre columnas es incómodo.
 */
export function StageSelector({
  opportunityId,
  stage,
  compact = false,
}: {
  opportunityId: string;
  stage: OpportunityStage;
  /** Variante reducida para las tarjetas del tablero. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [askingReason, setAskingReason] = useState(false);

  async function move(next: OpportunityStage, reason?: string) {
    setError(null);
    setIsPending(true);

    try {
      await api.post(`/api/oportunidades/${opportunityId}/etapa`, {
        stage: next,
        lostReason: reason,
      });
      setAskingReason(false);
      setLostReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo mover la oportunidad.",
      );
    } finally {
      setIsPending(false);
    }
  }

  function handleChange(next: OpportunityStage) {
    if (next === stage) return;
    // Perder exige motivo: se pide antes de enviar.
    if (next === "PERDIDA") {
      setAskingReason(true);
      return;
    }
    move(next);
  }

  return (
    <div className="space-y-2">
      <Select
        aria-label="Etapa de la oportunidad"
        value={askingReason ? "PERDIDA" : stage}
        disabled={isPending}
        onChange={(event) =>
          handleChange(event.target.value as OpportunityStage)
        }
        selectSize={compact ? "sm" : "md"}
      >
        {ALL_STAGES.map((option) => (
          <option key={option} value={option}>
            {OPPORTUNITY_STAGE_LABEL[option]}
          </option>
        ))}
      </Select>

      {askingReason && (
        <div className="space-y-2 rounded-md border border-border bg-muted p-2">
          <label
            htmlFor={`lost-${opportunityId}`}
            className="text-xs font-medium text-foreground"
          >
            ¿Por qué se perdió?
          </label>
          <Input
            id={`lost-${opportunityId}`}
            inputSize="sm"
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value)}
            placeholder="Precio, competencia, no responde…"
          />
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAskingReason(false);
                setLostReason("");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={lostReason.trim().length === 0 || isPending}
              onClick={() => move("PERDIDA", lostReason.trim())}
            >
              Marcar perdida
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
