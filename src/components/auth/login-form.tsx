"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const loginSchema = z.object({
  email: z.string().min(1, "Ingresa tu correo").email("Correo no válido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setFormError(null);

    // `redirect: false` permite mostrar el error en el formulario en vez de
    // mandar al usuario a la página de error genérica de Auth.js.
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
    });

    if (!result || result.error) {
      setFormError("Correo o contraseña incorrectos.");
      return;
    }

    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    router.push(callbackUrl);
    // Refresca los Server Components para que lean la nueva sesión.
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field id="email" label="Correo electrónico" error={errors.email?.message} required>
        {(props) => (
          <Input
            {...props}
            {...register("email")}
            type="email"
            autoComplete="username"
            placeholder="nombre@dicampo.co"
          />
        )}
      </Field>

      <Field id="password" label="Contraseña" error={errors.password?.message} required>
        {(props) => (
          <Input
            {...props}
            {...register("password")}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
          />
        )}
      </Field>

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
