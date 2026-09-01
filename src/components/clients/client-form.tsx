"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import { calculateNitDv } from "@/lib/nit";
import {
  clientCreateSchema,
  type ClientCreateInput,
  type ClientFormValues,
} from "@/server/validators/clients";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_TYPE_LABEL,
  PAYMENT_TERMS_LABEL,
  toOptions,
} from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const typeOptions = toOptions(CLIENT_TYPE_LABEL);
const statusOptions = toOptions(CLIENT_STATUS_LABEL);
const paymentTermsOptions = toOptions(PAYMENT_TERMS_LABEL);

type Props = {
  /** Cliente a editar; si falta, el formulario crea uno nuevo. */
  client?: Partial<ClientCreateInput> & { id: string };
};

export function ClientForm({ client }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = Boolean(client);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    // Los tres genéricos separan lo que el formulario mantiene (con campos
    // opcionales por los `.default()`) de lo que entrega ya validado.
  } = useForm<ClientFormValues, unknown, ClientCreateInput>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: {
      businessName: client?.businessName ?? "",
      tradeName: client?.tradeName ?? undefined,
      nit: client?.nit ?? undefined,
      nitDv: client?.nitDv ?? undefined,
      type: client?.type ?? "OTRO",
      status: client?.status ?? "PROSPECTO",
      email: client?.email ?? undefined,
      phone: client?.phone ?? undefined,
      paymentTerms: client?.paymentTerms ?? "CONTADO",
      creditLimit: client?.creditLimit ?? 0,
      notes: client?.notes ?? undefined,
    },
  });

  /** El DV es determinístico: se calcula solo al salir del campo NIT. */
  function handleNitBlur(event: React.FocusEvent<HTMLInputElement>) {
    const dv = calculateNitDv(event.target.value);
    if (dv) setValue("nitDv", dv, { shouldValidate: true });
  }

  async function onSubmit(values: ClientCreateInput) {
    setFormError(null);

    try {
      if (isEditing) {
        await api.patch(`/api/clientes/${client!.id}`, values);
        router.push(`/clientes/${client!.id}`);
      } else {
        const createdClient = await api.post<{ id: string }>(
          "/api/clientes",
          values,
        );
        router.push(`/clientes/${createdClient.id}`);
      }
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo guardar el cliente. Intenta de nuevo.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="businessName"
            label="Razón social"
            error={errors.businessName?.message}
            required
            className="sm:col-span-2"
          >
            {(props) => (
              <Input {...props} {...register("businessName")} placeholder="Restaurante El Buen Sabor S.A.S." />
            )}
          </Field>

          <Field
            id="tradeName"
            label="Nombre comercial"
            hint="Como lo conoce la gente, si es distinto"
            error={errors.tradeName?.message}
          >
            {(props) => <Input {...props} {...register("tradeName")} />}
          </Field>

          <Field id="type" label="Tipo de negocio" error={errors.type?.message}>
            {(props) => (
              <Select {...props} {...register("type")}>
                {typeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="nit" label="NIT" error={errors.nit?.message}>
            {(props) => (
              <Input
                {...props}
                {...register("nit", { onBlur: handleNitBlur })}
                inputMode="numeric"
                placeholder="900123456"
              />
            )}
          </Field>

          <Field
            id="nitDv"
            label="Dígito de verificación"
            hint="Se calcula solo a partir del NIT"
            error={errors.nitDv?.message}
          >
            {(props) => (
              <Input {...props} {...register("nitDv")} inputMode="numeric" maxLength={1} />
            )}
          </Field>

          <Field id="status" label="Estado" error={errors.status?.message}>
            {(props) => (
              <Select {...props} {...register("status")}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacto y condiciones comerciales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="phone" label="Teléfono" error={errors.phone?.message}>
            {(props) => (
              <Input {...props} {...register("phone")} type="tel" placeholder="310 729 6238" />
            )}
          </Field>

          <Field id="email" label="Correo" error={errors.email?.message}>
            {(props) => <Input {...props} {...register("email")} type="email" />}
          </Field>

          <Field
            id="paymentTerms"
            label="Condición de pago"
            error={errors.paymentTerms?.message}
          >
            {(props) => (
              <Select {...props} {...register("paymentTerms")}>
                {paymentTermsOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="creditLimit"
            label="Cupo de crédito (COP)"
            error={errors.creditLimit?.message}
          >
            {(props) => (
              <Input
                {...props}
                {...register("creditLimit")}
                type="number"
                min={0}
                step={1000}
              />
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
                placeholder="Horarios de recepción, preferencias de sabores, acuerdos…"
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
          {isSubmitting ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
