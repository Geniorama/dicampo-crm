"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  userCreateSchema,
  type UserCreateInput,
  type UserFormValues,
} from "@/server/validators/users";
import { USER_ROLE_LABEL, toOptions } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

const roleOptions = toOptions(USER_ROLE_LABEL);

/** Qué puede hacer cada rol, para que quien crea la cuenta elija con criterio. */
const ROLE_HELP: Record<string, string> = {
  ADMIN: "Acceso total, incluida la gestión de usuarios y precios.",
  VENDEDOR: "Solo su propia cartera de clientes, oportunidades y pedidos.",
  BODEGA: "Inventario, lotes y preparación de pedidos.",
  DESPACHO: "Rutas de reparto y registro de entregas.",
};

export function UserForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues, unknown, UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: "", email: "", password: "", role: "VENDEDOR" },
  });

  const selectedRole = watch("role") ?? "VENDEDOR";

  async function onSubmit(values: UserCreateInput) {
    setFormError(null);

    try {
      await api.post("/api/usuarios", values);
      router.push("/usuarios");
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear el usuario.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            id="name"
            label="Nombre completo"
            error={errors.name?.message}
            required
          >
            {(props) => <Input {...props} {...register("name")} />}
          </Field>

          <Field
            id="email"
            label="Correo"
            error={errors.email?.message}
            required
          >
            {(props) => (
              <Input
                {...props}
                {...register("email")}
                type="email"
                autoComplete="off"
                placeholder="nombre@dicampo.co"
              />
            )}
          </Field>

          <Field id="phone" label="Teléfono" error={errors.phone?.message}>
            {(props) => <Input {...props} {...register("phone")} type="tel" />}
          </Field>

          <Field
            id="role"
            label="Rol"
            hint={ROLE_HELP[selectedRole]}
            error={errors.role?.message}
          >
            {(props) => (
              <Select {...props} {...register("role")}>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="password"
            label="Contraseña inicial"
            hint="Mínimo 8 caracteres. Compártela por un canal seguro; la persona podrá cambiarla desde su perfil."
            error={errors.password?.message}
            required
            className="sm:col-span-2"
          >
            {(props) => (
              <Input
                {...props}
                {...register("password")}
                type="password"
                // El navegador no debe ofrecer guardar la clave de otra persona.
                autoComplete="new-password"
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
          {isSubmitting ? "Creando…" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}
