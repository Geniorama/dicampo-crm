"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPinOff, Pencil, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type ZoneChoice = { id: string; name: string };

export type AddressRow = {
  id: string;
  label: string;
  address: string;
  neighborhood: string | null;
  city: string;
  deliveryNotes: string | null;
  isPrimary: boolean;
  zone: { id: string; name: string } | null;
};

type Draft = {
  label: string;
  address: string;
  neighborhood: string;
  city: string;
  zoneId: string;
  deliveryNotes: string;
  isPrimary: boolean;
};

const emptyDraft: Draft = {
  label: "",
  address: "",
  neighborhood: "",
  city: "Bogotá",
  zoneId: "",
  deliveryNotes: "",
  isPrimary: false,
};

const toDraft = (address: AddressRow): Draft => ({
  label: address.label,
  address: address.address,
  neighborhood: address.neighborhood ?? "",
  city: address.city,
  zoneId: address.zone?.id ?? "",
  deliveryNotes: address.deliveryNotes ?? "",
  isPrimary: address.isPrimary,
});

function toPayload(draft: Draft) {
  return {
    label: draft.label.trim(),
    address: draft.address.trim(),
    neighborhood: draft.neighborhood.trim() || undefined,
    city: draft.city.trim() || "Bogotá",
    zoneId: draft.zoneId || undefined,
    deliveryNotes: draft.deliveryNotes.trim() || undefined,
    isPrimary: draft.isPrimary,
  };
}

/**
 * Sedes de entrega del cliente.
 *
 * La zona determina en qué ruta de reparto cae la sede, así que conviene
 * asignarla aunque sea opcional. Se dan de baja, no se borran: los pedidos ya
 * despachados apuntan a ellas.
 */
export function AddressManager({
  clientId,
  addresses,
  zones,
}: {
  clientId: string;
  addresses: AddressRow[];
  zones: ZoneChoice[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isAdding = editingId === "new";

  function openNew() {
    // La primera sede es necesariamente la principal.
    setDraft({ ...emptyDraft, isPrimary: addresses.length === 0 });
    setEditingId("new");
    setError(null);
  }

  function openEdit(address: AddressRow) {
    setDraft(toDraft(address));
    setEditingId(address.id);
    setError(null);
  }

  async function save() {
    setError(null);

    if (draft.label.trim().length < 2) {
      setError("Ponle un nombre a la sede.");
      return;
    }
    if (draft.address.trim().length < 5) {
      setError("La dirección es obligatoria.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = toPayload(draft);
      if (isAdding) {
        await api.post(`/api/clientes/${clientId}/sedes`, payload);
      } else {
        await api.patch(`/api/clientes/${clientId}/sedes/${editingId}`, payload);
      }
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo guardar la sede.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate(addressId: string) {
    setError(null);
    setIsSaving(true);
    try {
      await api.delete(`/api/clientes/${clientId}/sedes/${addressId}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo dar de baja la sede.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const form = (
    <div className="space-y-3 border-t border-border bg-muted px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="a-label" label="Nombre de la sede" required>
          {(props) => (
            <Input
              {...props}
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Sede Chapinero"
              autoFocus
            />
          )}
        </Field>
        <Field
          id="a-zoneId"
          label="Zona de reparto"
          hint="Define en qué ruta cae la entrega"
        >
          {(props) => (
            <Select
              {...props}
              value={draft.zoneId}
              onChange={(e) => setDraft({ ...draft, zoneId: e.target.value })}
            >
              <option value="">Sin asignar</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="a-address" label="Dirección" required className="sm:col-span-2">
          {(props) => (
            <Input
              {...props}
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              placeholder="Calle 63 # 11-20"
            />
          )}
        </Field>
        <Field id="a-neighborhood" label="Barrio">
          {(props) => (
            <Input
              {...props}
              value={draft.neighborhood}
              onChange={(e) => setDraft({ ...draft, neighborhood: e.target.value })}
            />
          )}
        </Field>
        <Field id="a-city" label="Ciudad">
          {(props) => (
            <Input
              {...props}
              value={draft.city}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            />
          )}
        </Field>
        <Field
          id="a-deliveryNotes"
          label="Indicaciones para el repartidor"
          className="sm:col-span-2"
        >
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              value={draft.deliveryNotes}
              onChange={(e) => setDraft({ ...draft, deliveryNotes: e.target.value })}
              placeholder="Horario de recepción, portería, timbre, parqueadero…"
            />
          )}
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.isPrimary}
          onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
          className="size-4 rounded border-input accent-[var(--primary)]"
        />
        Sede principal
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
          Cancelar
        </Button>
        <Button size="sm" disabled={isSaving} onClick={save}>
          {isSaving ? "Guardando…" : isAdding ? "Añadir sede" : "Guardar"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {addresses.length === 0 && !isAdding ? (
        <EmptyState
          title="Sin sedes registradas"
          description="Necesitas al menos una sede para poder despachar pedidos."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus aria-hidden="true" />
              Añadir sede
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {addresses.map((address) => (
            <li key={address.id}>
              <div className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {address.label}
                    {address.isPrimary && <Badge tone="primary">Principal</Badge>}
                    {address.zone ? (
                      <Badge tone="neutral">{address.zone.name}</Badge>
                    ) : (
                      <Badge tone="warning">Sin zona</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {address.address}
                    {address.neighborhood ? `, ${address.neighborhood}` : ""} ·{" "}
                    {address.city}
                  </p>
                  {address.deliveryNotes && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nota: {address.deliveryNotes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${address.label}`}
                    onClick={() => openEdit(address)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Dar de baja ${address.label}`}
                    disabled={isSaving}
                    onClick={() => deactivate(address.id)}
                  >
                    <MapPinOff aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {editingId === address.id && form}
            </li>
          ))}
        </ul>
      )}

      {isAdding && form}

      {!isAdding && editingId === null && addresses.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <Button variant="secondary" size="sm" onClick={openNew}>
            <Plus aria-hidden="true" />
            Añadir sede
          </Button>
        </div>
      )}

      {error && editingId === null && (
        <p role="alert" className="px-5 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
