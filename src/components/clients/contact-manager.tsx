"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Plus, UserMinus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { whatsappLink } from "@/lib/whatsapp";
import { DOC_TYPE_LABEL, toOptions } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import type { DocType } from "@/generated/prisma/enums";

const docTypeOptions = toOptions(DOC_TYPE_LABEL);

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  docType: DocType | null;
  docNumber: string | null;
  isPrimary: boolean;
};

type Draft = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  phone: string;
  whatsapp: string;
  docType: string;
  docNumber: string;
  isPrimary: boolean;
};

const emptyDraft: Draft = {
  firstName: "",
  lastName: "",
  jobTitle: "",
  email: "",
  phone: "",
  whatsapp: "",
  docType: "",
  docNumber: "",
  isPrimary: false,
};

const toDraft = (contact: ContactRow): Draft => ({
  firstName: contact.firstName,
  lastName: contact.lastName ?? "",
  jobTitle: contact.jobTitle ?? "",
  email: contact.email ?? "",
  phone: contact.phone ?? "",
  whatsapp: contact.whatsapp ?? "",
  docType: contact.docType ?? "",
  docNumber: contact.docNumber ?? "",
  isPrimary: contact.isPrimary,
});

/** Convierte el borrador al cuerpo de la API, omitiendo los campos vacíos. */
function toPayload(draft: Draft) {
  return {
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim() || undefined,
    jobTitle: draft.jobTitle.trim() || undefined,
    email: draft.email.trim() || undefined,
    phone: draft.phone.trim() || undefined,
    whatsapp: draft.whatsapp.trim() || undefined,
    docType: draft.docType || undefined,
    docNumber: draft.docNumber.trim() || undefined,
    isPrimary: draft.isPrimary,
  };
}

/**
 * Contactos del cliente: quién recibe la llamada o el WhatsApp del pedido.
 *
 * Se dan de baja, no se borran: las actividades de la bitácora los referencian.
 */
export function ContactManager({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isAdding = editingId === "new";

  function openNew() {
    setDraft({ ...emptyDraft, isPrimary: contacts.length === 0 });
    setEditingId("new");
    setError(null);
  }

  function openEdit(contact: ContactRow) {
    setDraft(toDraft(contact));
    setEditingId(contact.id);
    setError(null);
  }

  async function save() {
    setError(null);

    if (draft.firstName.trim().length < 2) {
      setError("El nombre es obligatorio.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = toPayload(draft);
      if (isAdding) {
        await api.post(`/api/clientes/${clientId}/contactos`, payload);
      } else {
        await api.patch(`/api/clientes/${clientId}/contactos/${editingId}`, payload);
      }
      setEditingId(null);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo guardar el contacto.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate(contactId: string) {
    setError(null);
    setIsSaving(true);
    try {
      await api.delete(`/api/clientes/${clientId}/contactos/${contactId}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo dar de baja el contacto.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const form = (
    <div className="space-y-3 border-t border-border bg-muted px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="c-firstName" label="Nombre" required>
          {(props) => (
            <Input
              {...props}
              value={draft.firstName}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              autoFocus
            />
          )}
        </Field>
        <Field id="c-lastName" label="Apellido">
          {(props) => (
            <Input
              {...props}
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
            />
          )}
        </Field>
        <Field id="c-jobTitle" label="Cargo">
          {(props) => (
            <Input
              {...props}
              value={draft.jobTitle}
              onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
              placeholder="Chef, administrador…"
            />
          )}
        </Field>
        <Field id="c-phone" label="Teléfono">
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          )}
        </Field>
        <Field
          id="c-whatsapp"
          label="WhatsApp"
          hint="Si se deja vacío se usa el teléfono"
        >
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={draft.whatsapp}
              onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
              placeholder="310 729 6238"
            />
          )}
        </Field>
        <Field id="c-email" label="Correo">
          {(props) => (
            <Input
              {...props}
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          )}
        </Field>
        <Field id="c-docType" label="Tipo de documento">
          {(props) => (
            <Select
              {...props}
              value={draft.docType}
              onChange={(e) => setDraft({ ...draft, docType: e.target.value })}
            >
              <option value="">Sin especificar</option>
              {docTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="c-docNumber" label="Número de documento">
          {(props) => (
            <Input
              {...props}
              value={draft.docNumber}
              onChange={(e) => setDraft({ ...draft, docNumber: e.target.value })}
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
        Contacto principal
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
          {isSaving ? "Guardando…" : isAdding ? "Añadir contacto" : "Guardar"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {contacts.length === 0 && !isAdding ? (
        <EmptyState
          title="Sin contactos registrados"
          description="Agrega a quién llamar o escribir para tomar los pedidos."
          action={
            <Button size="sm" onClick={openNew}>
              <Plus aria-hidden="true" />
              Añadir contacto
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((contact) => {
            const waLink = whatsappLink(contact.whatsapp ?? contact.phone);

            return (
              <li key={contact.id}>
                <div className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {contact.firstName} {contact.lastName ?? ""}
                      {contact.isPrimary && <Badge tone="primary">Principal</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[contact.jobTitle, contact.phone, contact.email]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de contacto"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        <MessageCircle aria-hidden="true" />
                        WhatsApp
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${contact.firstName}`}
                      onClick={() => openEdit(contact)}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Dar de baja a ${contact.firstName}`}
                      disabled={isSaving}
                      onClick={() => deactivate(contact.id)}
                    >
                      <UserMinus aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                {editingId === contact.id && form}
              </li>
            );
          })}
        </ul>
      )}

      {isAdding && form}

      {!isAdding && editingId === null && contacts.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <Button variant="secondary" size="sm" onClick={openNew}>
            <Plus aria-hidden="true" />
            Añadir contacto
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
