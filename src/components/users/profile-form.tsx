"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import { ownProfileSchema } from "@/server/validators/users";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Values = { name: string; phone?: string };

/** Cada persona pone su nombre y teléfono; el rol y el correo los cambia un ADMIN. */
export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Values>({
    resolver: zodResolver(ownProfileSchema),
    defaultValues: { name, phone: phone ?? "" },
  });

  async function onSubmit(values: Values) {
    setFormError(null);
    setSuccess(false);

    try {
      await api.patch("/api/perfil", values);
      setSuccess(true);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError ? error.message : "No se pudo guardar el perfil.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field id="name" label="Nombre" error={errors.name?.message} required>
        {(props) => <Input {...props} {...register("name")} autoComplete="name" />}
      </Field>

      <Field id="phone" label="Teléfono" error={errors.phone?.message}>
        {(props) => <Input {...props} {...register("phone")} type="tel" autoComplete="tel" />}
      </Field>

      {success && (
        <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success">
          Perfil actualizado. El nombre del menú se renueva al volver a iniciar sesión.
        </p>
      )}
      {formError && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
