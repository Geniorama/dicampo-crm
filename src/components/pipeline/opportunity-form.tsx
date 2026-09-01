"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  opportunityCreateSchema,
  type OpportunityCreateInput,
  type OpportunityFormValues,
} from "@/server/validators/pipeline";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { OPEN_STAGES } from "@/lib/pipeline-stages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type ClientChoice = { id: string; label: string };

export function OpportunityForm({
  clients,
  defaultClientId,
}: {
  clients: ClientChoice[];
  /** Preselecciona el cliente cuando se abre desde su ficha. */
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpportunityFormValues, unknown, OpportunityCreateInput>({
    resolver: zodResolver(opportunityCreateSchema),
    defaultValues: {
      clientId: defaultClientId ?? "",
      title: "",
      stage: "PROSPECTO",
      estimatedValue: 0,
    },
  });

  async function onSubmit(values: OpportunityCreateInput) {
    setFormError(null);

    try {
      const opportunity = await api.post<{ id: string }>(
        "/api/oportunidades",
        values,
      );
      router.push(`/pipeline/${opportunity.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear la oportunidad.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la oportunidad</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="clientId"
            label="Cliente"
            error={errors.clientId?.message}
            required
            className="sm:col-span-2"
          >
            {(props) => (
              <Select {...props} {...register("clientId")}>
                <option value="">Selecciona un cliente…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="title"
            label="Título"
            hint="Qué se está negociando"
            error={errors.title?.message}
            required
            className="sm:col-span-2"
          >
            {(props) => (
              <Input
                {...props}
                {...register("title")}
                placeholder="Suministro semanal de pulpa para 3 sedes"
              />
            )}
          </Field>

          <Field id="stage" label="Etapa" error={errors.stage?.message}>
            {(props) => (
              <Select {...props} {...register("stage")}>
                {OPEN_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {OPPORTUNITY_STAGE_LABEL[stage]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="estimatedValue"
            label="Valor mensual estimado (COP)"
            error={errors.estimatedValue?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("estimatedValue")}
                type="number"
                min={0}
                step={50000}
              />
            )}
          </Field>

          <Field
            id="expectedCloseDate"
            label="Fecha esperada de cierre"
            error={errors.expectedCloseDate?.message}
          >
            {(props) => (
              <Input {...props} {...register("expectedCloseDate")} type="date" />
            )}
          </Field>

          <Field
            id="notes"
            label="Notas"
            error={errors.notes?.message}
            className="sm:col-span-2"
          >
            {(props) => (
              <Textarea
                {...props}
                {...register("notes")}
                placeholder="Volumen estimado, sabores de interés, competencia actual…"
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creando…" : "Crear oportunidad"}
        </Button>
      </div>
    </form>
  );
}
