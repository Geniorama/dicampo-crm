"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, UserPlus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { computeOrderTotals } from "@/lib/order-math";
import { MIN_ORDER_KG, PORTIONS_PER_KG, applyPercentDiscount } from "@/lib/quote-rules";
import { clampDiscount } from "@/lib/quote-discount";
import { formatCOP } from "@/lib/format";
import {
  BILLING_MODE_LABEL,
  CLIENT_TYPE_LABEL,
  PRESENTATION_SHORT,
  toOptions,
} from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { EmptyState } from "@/components/ui/empty-state";
import type { BillingMode, ClientType, Presentation } from "@/generated/prisma/enums";

const clientTypeOptions = toOptions(CLIENT_TYPE_LABEL);

type NewClientDraft = {
  businessName: string;
  phone: string;
  email: string;
  type: ClientType;
};

const emptyNewClient: NewClientDraft = {
  businessName: "",
  phone: "",
  email: "",
  type: "OTRO",
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
  addresses: { id: string; label: string; address: string }[];
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

export function QuoteForm({
  clients: initialClients,
  variants,
  initialClientId,
  isAdmin = false,
}: {
  clients: QuoteClientOption[];
  variants: QuoteVariantOption[];
  /** Cliente preseleccionado al llegar desde su ficha. */
  initialClientId?: string;
  /** Un administrador puede salirse de los topes de descuento. */
  isAdmin?: boolean;
}) {
  const router = useRouter();

  // Los clientes creados desde aquí se suman a la lista sin recargar la página.
  const [clients, setClients] = useState(initialClients);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClient, setNewClient] = useState<NewClientDraft>(emptyNewClient);
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [isSavingClient, setIsSavingClient] = useState(false);

  const initialClient = clients.find((client) => client.id === initialClientId);

  const [clientId, setClientId] = useState(initialClient?.id ?? "");
  const [addressId, setAddressId] = useState(initialClient?.addresses[0]?.id ?? "");
  const [validUntil, setValidUntil] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [policy, setPolicy] = useState<DiscountPolicy | null>(null);
  // Tope del descuento manual: 8 % para vendedores; un ADMIN puede salirse.
  const discountMax = isAdmin
    ? 100
    : policy && "max" in policy.allowed
      ? policy.allowed.max
      : 0;
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Draft[]>([newDraft()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );

  const selectedClient = clients.find((client) => client.id === clientId);

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
    if (!variant || !selectedClient) return null;
    return variant.priceByList[selectedClient.priceListId] ?? null;
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
      const price =
        variant && selectedClient
          ? (variant.priceByList[selectedClient.priceListId] ?? null)
          : null;
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
  }, [lines, variantById, selectedClient, discountPercent]);

  // Al cambiar de cliente o de sede, el servidor dice qué descuento aplica:
  // 15 % si es nuevo, la negociación especial, o manual hasta 8 %.
  useEffect(() => {
    if (!clientId) return;
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
  }, [clientId, addressId]);

  const totalKilos = lines.reduce(
    (sum, line) => (line.variantId ? sum + (line.quantity || 0) : sum),
    0,
  );

  function updateLine(key: string, patch: Partial<Draft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    const client = clients.find((item) => item.id === nextClientId);
    setAddressId(client?.addresses[0]?.id ?? "");
  }

  async function handleCreateClient() {
    setNewClientError(null);
    if (newClient.businessName.trim().length < 3) {
      setNewClientError("Escribe el nombre o razón social (mínimo 3 letras).");
      return;
    }

    setIsSavingClient(true);
    try {
      // Queda como PROSPECTO con la lista de precios general; el servidor
      // asigna al vendedor como responsable.
      const created = await api.post<{
        id: string;
        businessName: string;
        tradeName: string | null;
        priceListId: string | null;
        billingMode: BillingMode;
      }>("/api/clientes", {
        businessName: newClient.businessName,
        phone: newClient.phone,
        email: newClient.email,
        type: newClient.type,
        status: "PROSPECTO",
      });

      const option: QuoteClientOption = {
        id: created.id,
        label: created.tradeName ?? created.businessName,
        priceListId: created.priceListId ?? "",
        billingMode: created.billingMode,
        addresses: [],
      };
      setClients((current) => [...current, option]);
      setClientId(option.id);
      setAddressId("");
      setNewClient(emptyNewClient);
      setCreatingClient(false);
    } catch (error) {
      setNewClientError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear el cliente. Intenta de nuevo.",
      );
    } finally {
      setIsSavingClient(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const items = lines
      .filter((line) => line.variantId && line.quantity > 0)
      .map((line) => ({ variantId: line.variantId, quantity: line.quantity }));

    if (!clientId) {
      setFormError("Selecciona el cliente.");
      return;
    }
    if (items.length === 0) {
      setFormError("Agrega al menos un producto con cantidad.");
      return;
    }

    setIsSubmitting(true);
    try {
      const quote = await api.post<{ id: string }>("/api/cotizaciones", {
        clientId,
        addressId: addressId || undefined,
        validUntil: validUntil || undefined,
        discountPercent,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Cliente y condiciones</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="clientId" label="Cliente" required className="sm:col-span-2">
            {(props) => (
              <Combobox
                {...props}
                value={clientId}
                onChange={handleClientChange}
                placeholder="Escribe el nombre, la razón social o el NIT…"
                emptyText="Ningún cliente coincide. Puedes crearlo abajo."
                options={clientOptions}
              />
            )}
          </Field>

          <div className="sm:col-span-2">
            {creatingClient ? (
              <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">Cliente nuevo</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    id="newClientName"
                    label="Nombre o razón social"
                    required
                    className="sm:col-span-2"
                  >
                    {(props) => (
                      <Input
                        {...props}
                        value={newClient.businessName}
                        onChange={(event) =>
                          setNewClient({ ...newClient, businessName: event.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="newClientPhone" label="Teléfono / WhatsApp">
                    {(props) => (
                      <Input
                        {...props}
                        type="tel"
                        value={newClient.phone}
                        onChange={(event) =>
                          setNewClient({ ...newClient, phone: event.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="newClientEmail" label="Correo">
                    {(props) => (
                      <Input
                        {...props}
                        type="email"
                        value={newClient.email}
                        onChange={(event) =>
                          setNewClient({ ...newClient, email: event.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field id="newClientType" label="Tipo de negocio">
                    {(props) => (
                      <Select
                        {...props}
                        value={newClient.type}
                        onChange={(event) =>
                          setNewClient({ ...newClient, type: event.target.value as ClientType })
                        }
                      >
                        {clientTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                {newClientError && (
                  <p role="alert" className="text-sm text-destructive">
                    {newClientError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCreatingClient(false);
                      setNewClientError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleCreateClient} disabled={isSavingClient}>
                    {isSavingClient ? "Creando…" : "Crear y seleccionar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se crea como prospecto con la lista de precios general. La sede y demás datos se
                  completan luego en su ficha.
                </p>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setCreatingClient(true)}>
                <UserPlus aria-hidden="true" />
                Cliente nuevo
              </Button>
            )}
          </div>

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

          {/* La define administración en la ficha del cliente: aquí solo se
              muestra, porque la cotización la hereda tal cual. */}
          <Field
            id="billingMode"
            label="Forma de facturación"
            hint="La define el administrador en la ficha del cliente."
          >
            {(props) => (
              <Input
                {...props}
                readOnly
                value={selectedClient ? BILLING_MODE_LABEL[selectedClient.billingMode] : "—"}
                className="bg-muted text-muted-foreground"
              />
            )}
          </Field>

          <Field id="validUntil" label="Válida hasta" hint="Vacío: 15 días desde hoy">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            )}
          </Field>

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
                    : isAdmin
                      ? "Manual (hasta 8 % para vendedores)"
                      : "Manual: de 0 a 8 %"
            }
          >
            {(props) =>
              policy && "only" in policy.allowed && (!isAdmin || policy.fixed) ? (
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
                  onChange={(event) =>
                    setDiscountPercent(clampDiscount(event.target.value, discountMax))
                  }
                />
              )
            }
          </Field>

          <Field id="notes" label="Notas" className="sm:col-span-2">
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
                        {!selectedClient
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
          La cotización no reserva inventario. Al aceptarla se convierte en pedido.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Crear cotización"}
          </Button>
        </div>
      </div>
    </form>
  );
}
