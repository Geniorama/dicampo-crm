"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { COLLECTION_STATUS_LABEL, toOptions } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { CollectionStatus } from "@/generated/prisma/enums";

const statusOptions = toOptions(COLLECTION_STATUS_LABEL);

/** Estado y observaciones de cobro de un cliente con cartera. */
export function CollectionForm({
  clientId,
  name,
  status,
  note,
}: {
  clientId: string;
  name: string;
  status: CollectionStatus;
  note: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState<CollectionStatus>(status);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = value !== status || text !== (note ?? "");

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.patch(`/api/cartera/${clientId}`, { collectionStatus: value, collectionNote: text });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo guardar la gestión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto]">
        <Select
          aria-label={`Estado de cobro de ${name}`}
          value={value}
          onChange={(event) => setValue(event.target.value as CollectionStatus)}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label={`Observaciones de cobro de ${name}`}
          value={text}
          maxLength={1000}
          onChange={(event) => setText(event.target.value)}
          placeholder="Observaciones de la gestión"
        />
        <Button size="sm" disabled={!dirty || saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar"}
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
