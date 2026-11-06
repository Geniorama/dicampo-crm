"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import {
  NEW_CLIENT_VISIT_TITLE,
  VISIT_CATEGORY_LABEL,
  VISIT_REASON_LABEL,
  toOptions,
} from "@/lib/labels";
import type { VisitCategory } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

export type ClientChoice = {
  id: string;
  label: string;
  locality: string | null;
  address: string | null;
};

type Kind = "NUEVO" | "FIDELIZACION";
type Reason = keyof typeof VISIT_REASON_LABEL;

/**
 * Registro de visita. "Cliente nuevo" es una demostración a un negocio que no
 * está en la base; "Fidelización" es a un cliente actual, con su motivo.
 */
export function VisitForm({
  clients,
  flavors,
  defaultClientId,
  today,
  advisors = [],
  defaultAdvisorId,
}: {
  clients: ClientChoice[];
  flavors: string[];
  defaultClientId?: string;
  /** Solo para un ADMIN: asesores a cuyo nombre se puede agendar. */
  advisors?: { id: string; name: string }[];
  defaultAdvisorId?: string;
  /** "AAAA-MM-DD" de hoy en Bogotá. */
  today: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(defaultClientId ? "FIDELIZACION" : "NUEVO");
  const [businessName, setBusinessName] = useState("");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [advisorId, setAdvisorId] = useState(defaultAdvisorId ?? "");
  const [reason, setReason] = useState<Reason>("RECAPACITACION");
  // Vacío = la del tipo de visita (Demostración o Fidelización).
  const [category, setCategory] = useState<VisitCategory | "">("");
  const [visitDate, setVisitDate] = useState(today);
  const [visitTime, setVisitTime] = useState("");
  const [sampleQuantity, setSampleQuantity] = useState("");
  const [sampleFlavor, setSampleFlavor] = useState("");
  const [locality, setLocality] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const client = clients.find((item) => item.id === clientId);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const body =
        kind === "NUEVO"
          ? {
              kind,
              businessName,
              category: category || undefined,
              advisorId: advisorId || undefined,
              visitDate,
              visitTime,
              sampleQuantity,
              sampleFlavor,
              locality,
              address,
              contactName,
            }
          : { kind, clientId, reason, category: category || undefined, advisorId: advisorId || undefined, visitDate, visitTime };

      const created = await api.post<{ id: string }>("/api/visitas", body);
      router.push(`/pipeline/${created.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo registrar la visita.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la visita</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {advisors.length > 0 && (
            <Field id="advisorId" label="Asesor" hint="La visita queda en la agenda de este asesor" className="sm:col-span-2">
              {(props) => (
                <Select {...props} value={advisorId} onChange={(event) => setAdvisorId(event.target.value)}>
                  {advisors.map((advisor) => (
                    <option key={advisor.id} value={advisor.id}>
                      {advisor.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          <Field id="kind" label="Tipo de visita" required className="sm:col-span-2">
            {(props) => (
              <Select {...props} value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
                <option value="NUEVO">Cliente nuevo (demostración)</option>
                <option value="FIDELIZACION">Fidelización (cliente actual)</option>
              </Select>
            )}
          </Field>

          <Field
            id="category"
            label="Categoría"
            hint="Es la etiqueta que se ve en el pipeline"
            className="sm:col-span-2"
          >
            {(props) => (
              <Select
                {...props}
                value={category}
                onChange={(event) => setCategory(event.target.value as VisitCategory | "")}
              >
                <option value="">
                  {kind === "NUEVO" ? "Demostración (por defecto)" : "Fidelización (por defecto)"}
                </option>
                {toOptions(VISIT_CATEGORY_LABEL).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {kind === "NUEVO" ? (
            <>
              <Field id="title" label="Título" hint="Queda así por defecto" className="sm:col-span-2">
                {(props) => <Input {...props} value={NEW_CLIENT_VISIT_TITLE} readOnly />}
              </Field>
              <Field
                id="businessName"
                label="Nombre del cliente"
                hint="Aún no está en la base: escríbelo"
                required
                className="sm:col-span-2"
              >
                {(props) => (
                  <Input
                    {...props}
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                  />
                )}
              </Field>
            </>
          ) : (
            <>
              <Field id="clientId" label="Cliente" required className="sm:col-span-2">
                {(props) => (
                  <Select {...props} value={clientId} onChange={(event) => setClientId(event.target.value)}>
                    <option value="">Selecciona un cliente…</option>
                    {clients.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="reason" label="Motivo (título)" required className="sm:col-span-2">
                {(props) => (
                  <Select {...props} value={reason} onChange={(event) => setReason(event.target.value as Reason)}>
                    {(Object.keys(VISIT_REASON_LABEL) as Reason[]).map((key) => (
                      <option key={key} value={key}>
                        {VISIT_REASON_LABEL[key]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </>
          )}

          <Field id="visitDate" label="Fecha de visita" required>
            {(props) => (
              <Input {...props} type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
            )}
          </Field>
          <Field id="visitTime" label="Hora de visita" required>
            {(props) => (
              <Input {...props} type="time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)} />
            )}
          </Field>

          {kind === "NUEVO" ? (
            <>
              <Field id="sampleQuantity" label="Muestra: cantidad" hint="No descuenta inventario" required>
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={0}
                    step="0.5"
                    inputMode="decimal"
                    value={sampleQuantity}
                    onChange={(event) => setSampleQuantity(event.target.value)}
                  />
                )}
              </Field>
              <Field id="sampleFlavor" label="Muestra: sabor de pulpa" required>
                {(props) => (
                  <Select {...props} value={sampleFlavor} onChange={(event) => setSampleFlavor(event.target.value)}>
                    <option value="">Selecciona…</option>
                    {flavors.map((flavor) => (
                      <option key={flavor} value={flavor}>
                        {flavor}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="locality" label="Localidad" required>
                {(props) => (
                  <Input {...props} value={locality} onChange={(event) => setLocality(event.target.value)} />
                )}
              </Field>
              <Field id="address" label="Dirección" required>
                {(props) => (
                  <Input {...props} value={address} onChange={(event) => setAddress(event.target.value)} />
                )}
              </Field>
              <Field
                id="contactName"
                label="Contacto"
                hint="Nombre de la persona de la visita"
                required
                className="sm:col-span-2"
              >
                {(props) => (
                  <Input
                    {...props}
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                  />
                )}
              </Field>
            </>
          ) : (
            <>
              <Field id="localityShown" label="Localidad" hint="Se carga de la base">
                {(props) => <Input {...props} value={client?.locality ?? ""} readOnly />}
              </Field>
              <Field id="addressShown" label="Dirección" hint="Se carga de la base">
                {(props) => <Input {...props} value={client?.address ?? ""} readOnly />}
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Registrando…" : "Registrar visita"}
        </Button>
      </div>
    </form>
  );
}
