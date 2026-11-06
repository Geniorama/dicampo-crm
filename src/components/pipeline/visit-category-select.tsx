"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { VISIT_CATEGORY_LABEL, toOptions } from "@/lib/labels";
import { Select } from "@/components/ui/field";
import type { VisitCategory } from "@/generated/prisma/enums";

const options = toOptions(VISIT_CATEGORY_LABEL);

/** Cambia la categoría (la etiqueta) de una oportunidad; vacío la quita. */
export function VisitCategorySelect({
  opportunityId,
  category,
}: {
  opportunityId: string;
  category: VisitCategory | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(next: string) {
    setError(null);
    setPending(true);
    try {
      await api.patch(`/api/oportunidades/${opportunityId}`, { visitCategory: next === "" ? null : next });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo cambiar la categoría.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Select
        aria-label="Categoría de la visita"
        value={category ?? ""}
        disabled={pending}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">Sin categoría</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
