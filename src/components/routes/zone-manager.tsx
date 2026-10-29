"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";

export type ZoneRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  /** Sedes activas y rutas que la usan. */
  addresses: number;
  routes: number;
};

function errorText(caught: unknown, fallback: string) {
  return caught instanceof ApiClientError ? caught.message : fallback;
}

/**
 * Zonas de entrega: crear, renombrar y activar o desactivar. No se borran
 * —sedes y rutas las referencian—; desactivar las saca de los selectores.
 */
export function ZoneManager({ zones }: { zones: ZoneRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await api.post("/api/zonas", { name, description });
      setName("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(errorText(caught, "No se pudo crear la zona."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Nueva zona</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field id="zone-name" label="Nombre" required>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Norte"
                />
              )}
            </Field>
            <Field id="zone-description" label="Qué cubre">
              {(props) => (
                <Input
                  {...props}
                  value={description}
                  maxLength={200}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Usaquén, Suba, Barrios Unidos"
                />
              )}
            </Field>
            <Button type="submit" disabled={isSaving || name.trim().length < 2}>
              <Plus aria-hidden="true" />
              {isSaving ? "Creando…" : "Crear zona"}
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        {zones.length === 0 ? (
          <EmptyState
            title="Todavía no hay zonas"
            description="Crea la primera para asignarla a las sedes de los clientes y a las rutas."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Zona</th>
                  <th scope="col" className="px-4 py-2 font-medium">En uso</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <ZoneRowView key={zone.id} zone={zone} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ZoneRowView({ zone }: { zone: ZoneRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(zone.name);
  const [description, setDescription] = useState(zone.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function save(data: Record<string, unknown>, onDone?: () => void) {
    setError(null);
    setIsPending(true);
    try {
      await api.patch(`/api/zonas/${zone.id}`, data);
      onDone?.();
      router.refresh();
    } catch (caught) {
      setError(errorText(caught, "No se pudo guardar la zona."));
    } finally {
      setIsPending(false);
    }
  }

  const inUse = zone.addresses + zone.routes > 0;

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3">
        {editing ? (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_2fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void save({ name, description }, () => setEditing(false));
            }}
          >
            <Input
              aria-label="Nombre de la zona"
              inputSize="sm"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              aria-label="Qué cubre"
              inputSize="sm"
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Localidades o barrios"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isPending || name.trim().length < 2}>
                Guardar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setName(zone.name);
                  setDescription(zone.description ?? "");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="flex items-center gap-2 font-medium text-foreground">
              {zone.name}
              {!zone.active && <Badge tone="neutral">Inactiva</Badge>}
            </p>
            {zone.description && (
              <p className="text-xs text-muted-foreground">{zone.description}</p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </td>

      <td className="px-4 py-3 text-xs text-muted-foreground">
        {zone.addresses} {zone.addresses === 1 ? "sede" : "sedes"} · {zone.routes}{" "}
        {zone.routes === 1 ? "ruta" : "rutas"}
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {!editing && (
            <Button variant="secondary" size="sm" disabled={isPending} onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Editar
            </Button>
          )}
          <Button
            variant={zone.active ? "secondary" : "primary"}
            size="sm"
            disabled={isPending}
            // Las sedes y rutas que ya la tienen la conservan; solo deja de ofrecerse.
            title={
              zone.active && inUse
                ? "Las sedes y rutas que ya la tienen la conservan; deja de ofrecerse para las nuevas."
                : undefined
            }
            onClick={() => void save({ active: !zone.active })}
          >
            {zone.active ? (
              <>
                <PowerOff aria-hidden="true" />
                Desactivar
              </>
            ) : (
              <>
                <Power aria-hidden="true" />
                Activar
              </>
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}
