"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { ACTIVITY_TYPE_LABEL, toOptions } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ActivityType } from "@/generated/prisma/enums";

const typeOptions = toOptions(ACTIVITY_TYPE_LABEL);

/**
 * Registra una interacción en la bitácora. Se ancla al cliente, la oportunidad
 * o el pedido desde el que se abre, así que el vendedor no tiene que elegirlo.
 */
export function ActivityForm({
  clientId,
  opportunityId,
  orderId,
}: {
  clientId?: string;
  opportunityId?: string;
  orderId?: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>("LLAMADA");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError("Describe la actividad.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post("/api/actividades", {
        type,
        subject: subject.trim(),
        notes: notes.trim() || undefined,
        clientId,
        opportunityId,
        orderId,
        dueAt: dueAt || undefined,
        // Con fecha compromiso queda pendiente; sin ella, es algo ya ocurrido.
        completed: !dueAt,
      });

      setSubject("");
      setNotes("");
      setDueAt("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo registrar la actividad.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="activityType" label="Tipo">
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(event) => setType(event.target.value as ActivityType)}
            >
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          id="activityDueAt"
          label="Recordar para"
          hint="Déjalo vacío si ya ocurrió"
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          )}
        </Field>
      </div>

      <Field id="activitySubject" label="Asunto" required>
        {(props) => (
          <Input
            {...props}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Llamada de seguimiento, envío de cotización…"
          />
        )}
      </Field>

      <Field id="activityNotes" label="Notas">
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Registrando…" : "Registrar actividad"}
        </Button>
      </div>
    </form>
  );
}
