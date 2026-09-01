"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiClientError } from "@/lib/api-client";
import {
  routeCreateSchema,
  type RouteCreateInput,
  type RouteFormValues,
} from "@/server/validators/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type Choice = { id: string; name: string };

export function RouteForm({
  zones,
  drivers,
}: {
  zones: Choice[];
  drivers: Choice[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RouteFormValues, unknown, RouteCreateInput>({
    resolver: zodResolver(routeCreateSchema),
    defaultValues: {
      name: "",
      date: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: RouteCreateInput) {
    setFormError(null);
    try {
      const created = await api.post<{ id: string }>("/api/rutas", values);
      router.push(`/rutas/${created.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear la ruta.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la ruta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Nombre" error={errors.name?.message} required>
            {(props) => (
              <Input {...props} {...register("name")} placeholder="Reparto Norte — martes" />
            )}
          </Field>

          <Field id="date" label="Fecha de reparto" error={errors.date?.message} required>
            {(props) => <Input {...props} {...register("date")} type="date" />}
          </Field>

          <Field
            id="zoneId"
            label="Zona"
            hint="Filtra los pedidos que se ofrecen al planear"
            error={errors.zoneId?.message}
          >
            {(props) => (
              <Select {...props} {...register("zoneId")}>
                <option value="">Sin zona específica</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="driverId" label="Repartidor" error={errors.driverId?.message}>
            {(props) => (
              <Select {...props} {...register("driverId")}>
                <option value="">Sin asignar</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="vehicle" label="Vehículo" error={errors.vehicle?.message}>
            {(props) => (
              <Input {...props} {...register("vehicle")} placeholder="Furgón ABC123" />
            )}
          </Field>

          <Field id="notes" label="Notas" error={errors.notes?.message} className="sm:col-span-2">
            {(props) => <Textarea {...props} {...register("notes")} rows={2} />}
          </Field>
        </CardContent>
      </Card>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          La ruta nace en planeación: después le asignas los pedidos y su orden.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Crear ruta"}
          </Button>
        </div>
      </div>
    </form>
  );
}
