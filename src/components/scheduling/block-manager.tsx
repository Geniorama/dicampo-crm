"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { todayInBogota } from "@/lib/visit-schedule";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { apiErrorMessage } from "./error-message";

/**
 * Ausencia con su rango ya en texto. Se formatea en el servidor: el ICU de
 * Node y el del navegador no siempre escriben igual "a. m.", y la diferencia
 * rompería la hidratación.
 */
export type BlockItem = { id: string; label: string; reason: string | null };

/**
 * Ausencias puntuales: vacaciones, incapacidades, capacitaciones. Mientras
 * dura una, la agenda no ofrece huecos de ese asesor.
 */
export function BlockManager({
  advisorId,
  blocks,
}: {
  advisorId: string;
  blocks: BlockItem[];
}) {
  const router = useRouter();
  const today = todayInBogota();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/api/agenda/asesores/${advisorId}/ausencias`, {
        fromDate,
        toDate,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        reason: reason.trim() || undefined,
      });
      setReason("");
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, "No se pudo registrar la ausencia."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeleting(id);
    try {
      await api.delete(`/api/agenda/ausencias/${id}`);
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, "No se pudo quitar la ausencia."));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {blocks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No hay ausencias registradas.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {blocks.map((block) => (
            <li key={block.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{block.label}</p>
                {block.reason && (
                  <p className="truncate text-xs text-muted-foreground">{block.reason}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Quitar ausencia"
                disabled={deleting === block.id}
                onClick={() => handleDelete(block.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-3 border-t border-border px-5 py-4"
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="blockFrom" label="Desde" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={fromDate}
                min={today}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  if (event.target.value > toDate) setToDate(event.target.value);
                }}
              />
            )}
          </Field>
          <Field id="blockTo" label="Hasta" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            )}
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(event) => setAllDay(event.target.checked)}
            className="size-4 rounded border-input accent-[var(--primary)]"
          />
          Días completos
        </label>

        {!allDay && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="blockStart" label="Hora de inicio" hint="El primer día">
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              )}
            </Field>
            <Field id="blockEnd" label="Hora de fin" hint="El último día">
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        <Field id="blockReason" label="Motivo">
          {(props) => (
            <Input
              {...props}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Vacaciones, cita médica, capacitación…"
            />
          )}
        </Field>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary" disabled={isSubmitting}>
            {isSubmitting ? "Registrando…" : "Registrar ausencia"}
          </Button>
        </div>
      </form>
    </div>
  );
}
