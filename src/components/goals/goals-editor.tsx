"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export type GoalRow = {
  /** Vacío = meta general de la empresa. */
  userId: string | null;
  label: string;
  salesTarget: number;
  newClientsTarget: number;
};

/**
 * Metas del mes, una fila por asesor más la general. Cada fila se guarda sola:
 * fijar la meta de una persona no debe obligar a tener lista la de las demás.
 */
export function GoalsEditor({ month, rows }: { month: string; rows: GoalRow[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <GoalRowEditor key={row.userId ?? "general"} month={month} row={row} />
      ))}
    </ul>
  );
}

function GoalRowEditor({ month, row }: { month: string; row: GoalRow }) {
  const router = useRouter();
  const [sales, setSales] = useState(String(row.salesTarget || ""));
  const [clients, setClients] = useState(String(row.newClientsTarget || ""));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty =
    Number(sales || 0) !== row.salesTarget || Number(clients || 0) !== row.newClientsTarget;

  async function save() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await api.put("/api/metas", {
        month,
        userId: row.userId ?? undefined,
        salesTarget: Number(sales || 0),
        newClientsTarget: Number(clients || 0),
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo guardar la meta.");
    } finally {
      setSaving(false);
    }
  }

  const id = row.userId ?? "general";

  return (
    <li className="grid items-end gap-3 px-5 py-4 sm:grid-cols-[1fr_12rem_9rem_auto]">
      <p className="text-sm font-medium text-foreground">{row.label}</p>

      <div>
        <label htmlFor={`sales-${id}`} className="text-xs font-medium text-muted-foreground">
          Ventas (COP)
        </label>
        <Input
          id={`sales-${id}`}
          type="number"
          min={0}
          step={100000}
          inputMode="numeric"
          value={sales}
          onChange={(event) => setSales(event.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <label htmlFor={`clients-${id}`} className="text-xs font-medium text-muted-foreground">
          Clientes nuevos
        </label>
        <Input
          id={`clients-${id}`}
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={clients}
          onChange={(event) => setClients(event.target.value)}
          className="mt-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={saving || !dirty} onClick={save}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
        {saved && !dirty && <span className="text-xs text-success">Guardada</span>}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive sm:col-span-4">
          {error}
        </p>
      )}
    </li>
  );
}
