"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  passwordChangeSchema,
  type PasswordChangeInput,
} from "@/server/validators/users";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Cambio de la propia contraseña, probando que se conoce la actual. */
export function PasswordChangeForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeInput>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: "", password: "" },
  });

  async function onSubmit(values: PasswordChangeInput) {
    setFormError(null);
    setSuccess(false);

    try {
      await api.post("/api/perfil/clave", values);
      reset();
      setSuccess(true);
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo cambiar la contraseña.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-5 py-4" noValidate>
      <Field
        id="currentPassword"
        label="Contraseña actual"
        error={errors.currentPassword?.message}
        required
      >
        {(props) => (
          <Input
            {...props}
            {...register("currentPassword")}
            type="password"
            autoComplete="current-password"
          />
        )}
      </Field>

      <Field
        id="password"
        label="Nueva contraseña"
        hint="Mínimo 8 caracteres"
        error={errors.password?.message}
        required
      >
        {(props) => (
          <Input
            {...props}
            {...register("password")}
            type="password"
            autoComplete="new-password"
          />
        )}
      </Field>

      {success && (
        <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success">
          Contraseña actualizada.
        </p>
      )}
      {formError && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </div>
    </form>
  );
}
