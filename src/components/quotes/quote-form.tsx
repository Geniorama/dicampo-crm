"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, UserCheck, UserPlus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { computeOrderTotals } from "@/lib/order-math";
import { MIN_ORDER_KG, PORTIONS_PER_KG, applyPercentDiscount } from "@/lib/quote-rules";
import { NEW_CLIENT_DISCOUNT_PCT, clampDiscount } from "@/lib/quote-discount";
import { formatCOP } from "@/lib/format";
import {
  BILLING_MODE_LABEL,
  CLIENT_TYPE_LABEL,
  PRESENTATION_SHORT,
  QUOTE_INVENTORY_NOTE,
  toOptions,
} from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import type { BillingMode, ClientStatus, ClientType, Presentation } from "@/generated/prisma/enums";

const clientTypeOptions = toOptions(CLIENT_TYPE_LABEL);
const billingOptions = toOptions(BILLING_MODE_LABEL);

/** Sede del cliente nuevo, con quién recibe ahí. */
type SedeDraft = {
  key: string;
  label: string;
  locality: string;
  neighborhood: string;
  address: string;
  contactName: string;
  whatsapp: string;
};

type NewClientDraft = {
  businessName: string;
  nit: string;
  phone: string;
  email: string;
  type: ClientType;
  priceListId: string;
  billingMode: BillingMode;
  notes: string;
  deliveryAddressIndex: number;
};

let sedeCounter = 0;
const newSede = (): SedeDraft => ({
  key: `sede-${(sedeCounter += 1)}`,
  label: "",
  locality: "",
  neighborhood: "",
  address: "",
  contactName: "",
  whatsapp: "",
});

export type QuoteClientAddress = {
  id: string;
  label: string;
  address: string;
  locality: string | null;
  neighborhood: string | null;
};

export type QuoteClientOption = {
  id: string;
  label: string;
  /** Razón social, cuando el nombre que se muestra es el comercial. */
  detail?: string;
  /** NIT u otros textos por los que también se busca. */
  keywords?: (string | null)[];
  /** Lista de precios del cliente (la general si no tiene propia). */
  priceListId: string;
  billingMode: BillingMode;
  /** Nivel de precio: Público general, Mayorista, Distribuidor o Superdistribuidor. */
  tier: string;
  businessName: string;
  nit: string | null;
  /** Un prospecto (de una visita) pasa a cliente con su primera cotización. */
  status: ClientStatus;
  type: ClientType;
  phone: string | null;
  email: string | null;
  notes: string | null;
  contactName: string | null;
  addresses: QuoteClientAddress[];
};

export type QuoteVariantOption = {
  id: string;
  presentation: Presentation;
  productName: string;
  taxRate: number;
  /** Existencias de esta presentación, en su propia unidad. */
  available: number;
  /** Kilos de pulpa disponibles del sabor, sumando sus presentaciones. */
  flavorKilos: number;
  /** Precio base por lista de precios; falta si la variante no está en ella. */
  priceByList: Record<string, number>;
};

type Draft = {
  key: string;
  variantId: string;
  quantity: number;
};

let draftCounter = 0;
const newDraft = (): Draft => ({
  key: `line-${(draftCounter += 1)}`,
  variantId: "",
  quantity: 1,
});

/** Descuento que corresponde al cliente y la sede, calculado por el servidor. */
type DiscountPolicy = {
  kind: "NEGOCIACION" | "NUEVO" | "MANUAL";
  suggested: number;
  allowed: { min: number; max: number } | { only: number[] };
  /** Promo de cliente nuevo: nadie la cambia, tampoco un ADMIN. */
  fixed: boolean;
  label: string;
};

/** Existencias del sabor elegido; avisa si la cantidad supera lo que hay. */
function StockHint({
  variant,
  quantity,
}: {
  variant: QuoteVariantOption | undefined;
  quantity: number;
}) {
  if (!variant) return null;

  const fmt = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  const short = quantity > variant.available;
  const own = `${fmt(variant.available)} ${PRESENTATION_SHORT[variant.presentation]}`;

  return (
    <p className={`mt-1 text-xs ${short ? "text-warning" : "text-muted-foreground"}`}>
      {variant.available <= 0 ? "Sin existencias" : `Disponible: ${own}`}
      {variant.flavorKilos > 0 && ` · ${fmt(variant.flavorKilos)} kg del sabor`}
      {short && variant.available > 0 && " — la cantidad supera lo disponible"}
    </p>
  );
}

/** Dato de solo lectura que se trae de la ficha del cliente actual. */
function Readonly({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export function QuoteForm({
  clients,
  variants,
  priceLists,
  advisors,
  defaultAdvisorId,
  today,
  initialClientId,
  isAdmin = false,
}: {
  clients: QuoteClientOption[];
  variants: QuoteVariantOption[];
  priceLists: { id: string; name: string }[];
  /** Asesores a los que se atribuye la venta (Andrés, Fabián, Felipe, Karen…). */
  advisors: { id: string; name: string }[];
  defaultAdvisorId: string;
  /** Fecha de hoy en Bogotá ("AAAA-MM-DD"): la cotización siempre es de hoy. */
  today: string;
  /** Cliente preseleccionado al llegar desde su ficha. */
  initialClientId?: string;
  /** Solo un administrador elige a nombre de qué asesor se vende. */
  isAdmin?: boolean;
}) {
  const router = useRouter();

  const initialClient = clients.find((client) => client.id === initialClientId);

  // Lo primero que se elige: sin elegir no se muestra el formulario. Si se
  // llega desde la ficha de un cliente, ya se sabe que es actual.
  const [mode, setMode] = useState<"ACTUAL" | "NUEVO" | null>(initialClient ? "ACTUAL" : null);
  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [addressId, setAddressId] = useState(initialClient?.addresses[0]?.id ?? "");
  const [sellerId, setSellerId] = useState(defaultAdvisorId);
  // El asesor confirma que vio los datos del cliente actual antes de cotizar.
  const [confirmed, setConfirmed] = useState(false);
  const [newClient, setNewClient] = useState<NewClientDraft>({
    businessName: "",
    nit: "",
    phone: "",
    email: "",
    type: "OTRO",
    priceListId: priceLists[0]?.id ?? "",
    billingMode: "FACTURA",
    notes: "",
    deliveryAddressIndex: 0,
  });
  const [sedes, setSedes] = useState<SedeDraft[]>([newSede()]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [policy, setPolicy] = useState<DiscountPolicy | null>(null);
  // Cliente actual: de 0 a 8 %. El 15 % es solo del cliente nuevo.
  const discountMax = policy && "max" in policy.allowed ? policy.allowed.max : 0;
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Draft[]>([newDraft()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );

  const selectedClient = mode === "ACTUAL" ? clients.find((client) => client.id === clientId) : undefined;
  const selectedAddress = selectedClient?.addresses.find((address) => address.id === addressId);
  const activePriceListId = mode === "NUEVO" ? newClient.priceListId : (selectedClient?.priceListId ?? "");

  const clientOptions = useMemo<ComboboxOption[]>(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.label,
        detail: client.detail,
        keywords: client.keywords,
      })),
    [clients],
  );

  function priceOf(variantId: string): number | null {
    const variant = variantById.get(variantId);
    if (!variant || !activePriceListId) return null;
    return variant.priceByList[activePriceListId] ?? null;
  }

  // Vista previa con la misma aritmética del servidor; el servidor recalcula
  // con la lista real y es quien decide la cifra definitiva.
  const { totals, pricedIndex } = useMemo(() => {
    const priced: {
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRate: number;
    }[] = [];
    const index = new Map<string, number>();

    for (const line of lines) {
      const variant = variantById.get(line.variantId);
      const price = variant && activePriceListId ? (variant.priceByList[activePriceListId] ?? null) : null;
      if (!variant || price === null) continue;

      index.set(line.key, priced.length);
      priced.push({
        quantity: line.quantity,
        unitPrice: price,
        discount: 0,
        taxRate: variant.taxRate,
      });
    }

    return {
      totals: computeOrderTotals(applyPercentDiscount(priced, discountPercent)),
      pricedIndex: index,
    };
  }, [lines, variantById, activePriceListId, discountPercent]);

  // Cliente actual: el servidor dice qué descuento aplica a ese cliente y sede
  // (15 % si aún no ha pedido, la negociación especial, o manual de 0 a 8 %).
  useEffect(() => {
    if (mode !== "ACTUAL" || !clientId) return;
    let cancelled = false;

    const query = new URLSearchParams({ clientId });
    if (addressId) query.set("addressId", addressId);

    api
      .get<DiscountPolicy>(`/api/cotizaciones/descuento?${query.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setPolicy(result);
        setDiscountPercent(result.suggested);
      })
      .catch(() => {
        if (!cancelled) setPolicy(null);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, clientId, addressId]);

  // Cliente nuevo: 15 % fijo en su primer pedido.
  useEffect(() => {
    if (mode !== "NUEVO") return;
    setPolicy({
      kind: "NUEVO",
      suggested: NEW_CLIENT_DISCOUNT_PCT,
      allowed: { only: [NEW_CLIENT_DISCOUNT_PCT] },
      fixed: true,
      label: `Cliente nuevo ${NEW_CLIENT_DISCOUNT_PCT} %`,
    });
    setDiscountPercent(NEW_CLIENT_DISCOUNT_PCT);
  }, [mode]);

  const totalKilos = lines.reduce(
    (sum, line) => (line.variantId ? sum + (line.quantity || 0) : sum),
    0,
  );

  function updateLine(key: string, patch: Partial<Draft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function updateSede(key: string, patch: Partial<SedeDraft>) {
    setSedes((current) => current.map((sede) => (sede.key === key ? { ...sede, ...patch } : sede)));
  }

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    setConfirmed(false);
    const client = clients.find((item) => item.id === nextClientId);
    setAddressId(client?.addresses[0]?.id ?? "");
  }

  function switchMode(next: "ACTUAL" | "NUEVO") {
    setMode(next);
    setPolicy(null);
    setDiscountPercent(next === "NUEVO" ? NEW_CLIENT_DISCOUNT_PCT : 0);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const items = lines
      .filter((line) => line.variantId && line.quantity > 0)
      .map((line) => ({ variantId: line.variantId, quantity: line.quantity }));

    if (mode === "ACTUAL" && !clientId) {
      setFormError("Selecciona el cliente.");
      return;
    }
    if (mode === "ACTUAL" && !confirmed) {
      setFormError("Revisa los datos del cliente y confírmalos antes de guardar.");
      return;
    }
    if (mode === "NUEVO") {
      if (newClient.businessName.trim().length < 3) {
        setFormError("Escribe el nombre del cliente nuevo (mínimo 3 letras).");
        return;
      }
      if (newClient.nit.replace(/\D/g, "").length < 5) {
        setFormError("Escribe la cédula o NIT del cliente nuevo.");
        return;
      }
      if (!newClient.phone.trim()) {
        setFormError("Escribe el teléfono o WhatsApp del cliente nuevo.");
        return;
      }
      if (!newClient.priceListId) {
        setFormError("Elige la lista de precios del cliente nuevo.");
        return;
      }
      const incomplete = sedes.some(
        (sede) =>
          !sede.locality.trim() || !sede.address.trim() || !sede.contactName.trim() || !sede.whatsapp.trim(),
      );
      if (incomplete) {
        setFormError("Cada sede necesita localidad, dirección, contacto y WhatsApp.");
        return;
      }
    }
    if (items.length === 0) {
      setFormError("Agrega al menos un producto con cantidad.");
      return;
    }

    const client =
      mode === "ACTUAL"
        ? { clientId, addressId: addressId || undefined }
        : {
            newClient: {
              businessName: newClient.businessName,
              nit: newClient.nit,
              phone: newClient.phone,
              email: newClient.email,
              type: newClient.type,
              priceListId: newClient.priceListId,
              billingMode: newClient.billingMode,
              notes: newClient.notes || undefined,
              deliveryAddressIndex: newClient.deliveryAddressIndex,
              addresses: sedes.map((sede) => ({
                label: sede.label || undefined,
                locality: sede.locality,
                neighborhood: sede.neighborhood || undefined,
                address: sede.address,
                contactName: sede.contactName,
                whatsapp: sede.whatsapp,
              })),
            },
          };

    setIsSubmitting(true);
    try {
      const quote = await api.post<{ id: string }>("/api/cotizaciones", {
        ...client,
        sellerId: sellerId || undefined,
        // El 15 % del cliente nuevo lo fija el servidor.
        discountPercent: mode === "ACTUAL" ? discountPercent : undefined,
        notes: notes || undefined,
        items,
      });

      router.push(`/cotizaciones/${quote.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear la cotización. Intenta de nuevo.",
      );
      setIsSubmitting(false);
    }
  }

  if (mode === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>¿Para quién es la cotización?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => switchMode("ACTUAL")}
            className="rounded-lg border border-border p-5 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserCheck className="size-5 text-primary" aria-hidden="true" />
              Cliente actual
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Ya está en la base: buscas el cliente, revisas sus datos y los confirmas.
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchMode("NUEVO")}
            className="rounded-lg border border-border p-5 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserPlus className="size-5 text-primary" aria-hidden="true" />
              Cliente nuevo
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Aún no existe: registras sus datos y sedes, y recibe el 15 % del primer pedido.
            </span>
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Cliente y condiciones</CardTitle>
          <div role="group" aria-label="Tipo de cliente" className="flex gap-1">
            {(["ACTUAL", "NUEVO"] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={mode === key ? "primary" : "secondary"}
                aria-pressed={mode === key}
                onClick={() => switchMode(key)}
              >
                {key === "ACTUAL" ? "Cliente actual" : "Cliente nuevo"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="quoteDate" label="Fecha" hint="Siempre es la de hoy: no se montan pedidos en otros días.">
            {(props) => <Input {...props} type="date" value={today} readOnly className="bg-muted text-muted-foreground" />}
          </Field>

          <Field id="sellerId" label="Asesor" required>
            {(props) => (
              <Select
                {...props}
                value={sellerId}
                onChange={(event) => setSellerId(event.target.value)}
                disabled={!isAdmin}
              >
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {mode === "ACTUAL" ? (
            <>
              <Field id="clientId" label="Cliente" required className="sm:col-span-2">
                {(props) => (
                  <Combobox
                    {...props}
                    value={clientId}
                    onChange={handleClientChange}
                    placeholder="Escribe el nombre, la razón social o el NIT…"
                    emptyText="Ningún cliente coincide. Usa «Cliente nuevo» para registrarlo."
                    options={clientOptions}
                  />
                )}
              </Field>

              <Field id="addressId" label="Sede">
                {(props) => (
                  <Select
                    {...props}
                    value={addressId}
                    onChange={(event) => setAddressId(event.target.value)}
                    disabled={!selectedClient}
                  >
                    <option value="">Sin especificar</option>
                    {selectedClient?.addresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.label} — {address.address}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              {selectedClient && (
                <div className="grid gap-3 rounded-md bg-muted/50 p-4 sm:col-span-2 sm:grid-cols-3">
                  <Readonly label="Nombre" value={selectedClient.businessName} />
                  <Readonly label="NIT / cédula" value={selectedClient.nit} />
                  <Readonly label="Tipo de cliente" value={selectedClient.tier} />
                  <Readonly label="Tipo de negocio" value={CLIENT_TYPE_LABEL[selectedClient.type]} />
                  <Readonly label="Facturación" value={BILLING_MODE_LABEL[selectedClient.billingMode]} />
                  <Readonly label="Contacto" value={selectedClient.contactName} />
                  <Readonly label="Teléfono" value={selectedClient.phone} />
                  <Readonly label="Correo" value={selectedClient.email} />
                  <Readonly label="Localidad" value={selectedAddress?.locality} />
                  <Readonly label="Barrio" value={selectedAddress?.neighborhood} />
                  <Readonly label="Dirección" value={selectedAddress?.address} />
                  <Readonly label="Notas del cliente" value={selectedClient.notes} />

                  <div className="space-y-2 sm:col-span-3">
                    {selectedClient.status === "PROSPECTO" && (
                      <p className="rounded-md bg-info-subtle px-3 py-2 text-xs text-info">
                        Es un prospecto de una visita: con esta cotización pasa al módulo de Clientes.
                      </p>
                    )}
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                      />
                      Confirmo que los datos del cliente son correctos
                    </label>
                    <a
                      href={`/clientes/${selectedClient.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      ¿Algo está mal? Corrige la ficha del cliente
                    </a>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <Field id="newClientName" label="Nombre o razón social" required className="sm:col-span-2">
                {(props) => (
                  <Input
                    {...props}
                    value={newClient.businessName}
                    onChange={(event) => setNewClient({ ...newClient, businessName: event.target.value })}
                  />
                )}
              </Field>
              <Field id="newClientNit" label="Cédula o NIT" required>
                {(props) => (
                  <Input
                    {...props}
                    inputMode="numeric"
                    value={newClient.nit}
                    onChange={(event) => setNewClient({ ...newClient, nit: event.target.value })}
                  />
                )}
              </Field>
              <Field id="newClientPhone" label="Teléfono / WhatsApp" required>
                {(props) => (
                  <Input
                    {...props}
                    type="tel"
                    value={newClient.phone}
                    onChange={(event) => setNewClient({ ...newClient, phone: event.target.value })}
                  />
                )}
              </Field>
              <Field id="newClientEmail" label="Correo (opcional)">
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    value={newClient.email}
                    onChange={(event) => setNewClient({ ...newClient, email: event.target.value })}
                  />
                )}
              </Field>
              <Field id="newClientType" label="Tipo de negocio">
                {(props) => (
                  <Select
                    {...props}
                    value={newClient.type}
                    onChange={(event) => setNewClient({ ...newClient, type: event.target.value as ClientType })}
                  >
                    {clientTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="newClientPriceList" label="Lista de precios" required>
                {(props) => (
                  <Select
                    {...props}
                    value={newClient.priceListId}
                    onChange={(event) => setNewClient({ ...newClient, priceListId: event.target.value })}
                  >
                    {priceLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="newClientBilling" label="Remisión o factura" required>
                {(props) => (
                  <Select
                    {...props}
                    value={newClient.billingMode}
                    onChange={(event) =>
                      setNewClient({ ...newClient, billingMode: event.target.value as BillingMode })
                    }
                  >
                    {billingOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Sedes</p>
                  <Button variant="secondary" size="sm" onClick={() => setSedes((current) => [...current, newSede()])}>
                    <Plus aria-hidden="true" />
                    Agregar sede
                  </Button>
                </div>
                {sedes.map((sede, index) => (
                  <div key={sede.key} className="space-y-3 rounded-md border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="radio"
                          name="deliveryAddress"
                          checked={newClient.deliveryAddressIndex === index}
                          onChange={() => setNewClient({ ...newClient, deliveryAddressIndex: index })}
                        />
                        Sede {index + 1}: este pedido va aquí
                      </label>
                      {sedes.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar la sede ${index + 1}`}
                          onClick={() => {
                            setSedes((current) => current.filter((item) => item.key !== sede.key));
                            setNewClient((current) => ({ ...current, deliveryAddressIndex: 0 }));
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id={`${sede.key}-locality`} label="Localidad" required>
                        {(props) => (
                          <Input
                            {...props}
                            value={sede.locality}
                            onChange={(event) => updateSede(sede.key, { locality: event.target.value })}
                          />
                        )}
                      </Field>
                      <Field id={`${sede.key}-neighborhood`} label="Barrio">
                        {(props) => (
                          <Input
                            {...props}
                            value={sede.neighborhood}
                            onChange={(event) => updateSede(sede.key, { neighborhood: event.target.value })}
                          />
                        )}
                      </Field>
                      <Field id={`${sede.key}-address`} label="Dirección" required className="sm:col-span-2">
                        {(props) => (
                          <Input
                            {...props}
                            value={sede.address}
                            onChange={(event) => updateSede(sede.key, { address: event.target.value })}
                          />
                        )}
                      </Field>
                      <Field id={`${sede.key}-contact`} label="Contacto" required>
                        {(props) => (
                          <Input
                            {...props}
                            value={sede.contactName}
                            onChange={(event) => updateSede(sede.key, { contactName: event.target.value })}
                          />
                        )}
                      </Field>
                      <Field id={`${sede.key}-whatsapp`} label="WhatsApp" required>
                        {(props) => (
                          <Input
                            {...props}
                            type="tel"
                            value={sede.whatsapp}
                            onChange={(event) => updateSede(sede.key, { whatsapp: event.target.value })}
                          />
                        )}
                      </Field>
                    </div>
                  </div>
                ))}
              </div>

              <Field id="newClientNotes" label="Observaciones del cliente" className="sm:col-span-2">
                {(props) => (
                  <Textarea
                    {...props}
                    value={newClient.notes}
                    onChange={(event) => setNewClient({ ...newClient, notes: event.target.value })}
                  />
                )}
              </Field>
            </>
          )}

          <Field
            id="discountPercent"
            label="Descuento"
            hint={
              !policy
                ? "Elige un cliente para ver el descuento que le corresponde"
                : policy.kind === "NEGOCIACION"
                  ? "Negociación especial: porcentaje fijo según la sede"
                  : policy.kind === "NUEVO"
                    ? "Cliente nuevo: 15 % en el primer pedido, sin excepción y sin otros descuentos"
                    : "Cliente actual: de 0 a 8 %"
            }
          >
            {(props) =>
              policy && "only" in policy.allowed ? (
                <Select
                  {...props}
                  value={discountPercent}
                  onChange={(event) => setDiscountPercent(Number(event.target.value))}
                  disabled={policy.allowed.only.length === 1}
                >
                  {policy.allowed.only.map((value) => (
                    <option key={value} value={value}>
                      {value === 0 ? "Sin descuento" : `${value} %`}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...props}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={discountMax}
                  step="0.5"
                  value={discountPercent}
                  disabled={!policy}
                  // Se recorta al teclear: escribir 20 deja 8, no un error al guardar.
                  onChange={(event) => setDiscountPercent(clampDiscount(event.target.value, discountMax))}
                />
              )
            }
          </Field>

          <Field id="notes" label="Observaciones del asesor" className="sm:col-span-2">
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Condiciones, tiempos de entrega, acuerdos…"
              />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setLines((current) => [...current, newDraft()])}
          >
            <Plus aria-hidden="true" />
            Agregar línea
          </Button>
        </CardHeader>

        {lines.length === 0 ? (
          <EmptyState title="La cotización está vacía" description="Agrega al menos un producto." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                  <th scope="col" className="w-28 px-4 py-2 font-medium">Cantidad</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Precio</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Subtotal</th>
                  <th scope="col" className="w-12 px-4 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const price = priceOf(line.variantId);
                  const at = pricedIndex.get(line.key);
                  const lineSubtotal = at === undefined ? undefined : totals.lines[at]?.subtotal;

                  return (
                    <tr key={line.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <Select
                          aria-label={`Producto de la línea ${index + 1}`}
                          value={line.variantId}
                          onChange={(event) =>
                            updateLine(line.key, { variantId: event.target.value })
                          }
                        >
                          <option value="">Selecciona…</option>
                          {variants.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.productName} · {PRESENTATION_SHORT[option.presentation]}
                            </option>
                          ))}
                        </Select>
                        <StockHint
                          variant={variantById.get(line.variantId)}
                          quantity={line.quantity}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          aria-label={`Cantidad de la línea ${index + 1}`}
                          type="number"
                          min={0}
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.key, { quantity: Number(event.target.value) })
                          }
                        />
                      </td>
                      <td className="tabular px-4 py-2 text-right text-muted-foreground">
                        {!activePriceListId
                          ? "—"
                          : line.variantId
                            ? price === null
                              ? "Sin precio"
                              : formatCOP(price)
                            : "—"}
                      </td>
                      <td className="tabular px-4 py-2 text-right font-medium text-foreground">
                        {lineSubtotal !== undefined ? formatCOP(lineSubtotal) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar línea ${index + 1}`}
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.key !== line.key))
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot className="border-t border-border">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                    Subtotal
                  </td>
                  <td className="tabular px-4 py-2 text-right">{formatCOP(totals.subtotal)}</td>
                  <td />
                </tr>
                {totals.discount > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                      Descuento
                    </td>
                    <td className="tabular px-4 py-2 text-right text-destructive">
                      −{formatCOP(totals.discount)}
                    </td>
                    <td />
                  </tr>
                )}
                {totals.tax > 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                      IVA
                    </td>
                    <td className="tabular px-4 py-2 text-right">{formatCOP(totals.tax)}</td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold text-foreground">
                    Total
                  </td>
                  <td className="tabular px-4 py-3 text-right text-base font-semibold text-foreground">
                    {formatCOP(totals.total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {totalKilos > 0 && (
        <p
          className={
            totalKilos < MIN_ORDER_KG
              ? "rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning"
              : "text-sm text-muted-foreground"
          }
        >
          {totalKilos.toLocaleString("es-CO")} kg · {(totalKilos * PORTIONS_PER_KG).toLocaleString("es-CO")}{" "}
          porciones de 125 g
          {totalKilos < MIN_ORDER_KG ? ` — el pedido mínimo es de ${MIN_ORDER_KG} kg` : ""}
        </p>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {QUOTE_INVENTORY_NOTE}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : "Guardar cotización"}
          </Button>
        </div>
      </div>
    </form>
  );
}
