"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { computeOrderTotals } from "@/lib/order-math";
import { formatCOP } from "@/lib/format";
import {
  ORDER_CHANNEL_LABEL,
  PRESENTATION_SHORT,
  toOptions,
} from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import type { OrderChannel, Presentation } from "@/generated/prisma/enums";

const channelOptions = toOptions(ORDER_CHANNEL_LABEL);

export type ClientOption = {
  id: string;
  label: string;
  addresses: { id: string; label: string; address: string }[];
};

export type VariantOption = {
  id: string;
  sku: string;
  presentation: Presentation;
  productName: string;
  taxRate: number;
  /** Precio base de la lista por defecto; null si la variante no tiene precio. */
  price: number | null;
};

/** Una línea del pedido en construcción. */
type Draft = {
  /** Clave estable para React: los índices se rompen al eliminar líneas. */
  key: string;
  variantId: string;
  quantity: number;
  discount: number;
};

let draftCounter = 0;
const newDraft = (): Draft => ({
  key: `line-${(draftCounter += 1)}`,
  variantId: "",
  quantity: 1,
  discount: 0,
});

export function OrderForm({
  clients,
  variants,
}: {
  clients: ClientOption[];
  variants: VariantOption[];
}) {
  const router = useRouter();

  const [clientId, setClientId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [channel, setChannel] = useState<OrderChannel>("WHATSAPP");
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Draft[]>([newDraft()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );

  const selectedClient = clients.find((client) => client.id === clientId);

  // Solo las líneas ya completas cuentan para el total en pantalla. El
  // servidor recalcula con la lista de precios real del cliente: esto es una
  // previsualización, no la cifra definitiva.
  const totals = useMemo(() => {
    const priced = lines
      .map((line) => {
        const variant = variantById.get(line.variantId);
        if (!variant || variant.price === null) return null;

        return {
          quantity: line.quantity,
          unitPrice: variant.price,
          discount: line.discount,
          taxRate: variant.taxRate,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

    return computeOrderTotals(priced);
  }, [lines, variantById]);

  function updateLine(key: string, patch: Partial<Draft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId);
    // La sede anterior pertenece a otro cliente: se preselecciona la primera.
    const client = clients.find((item) => item.id === nextClientId);
    setAddressId(client?.addresses[0]?.id ?? "");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const items = lines
      .filter((line) => line.variantId && line.quantity > 0)
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        discount: line.discount,
      }));

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
      const order = await api.post<{ id: string }>("/api/pedidos", {
        clientId,
        addressId: addressId || undefined,
        channel,
        requestedDeliveryDate: requestedDeliveryDate || undefined,
        notes: notes || undefined,
        items,
      });

      router.push(`/pedidos/${order.id}`);
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiClientError
          ? error.message
          : "No se pudo crear el pedido. Intenta de nuevo.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Cliente y entrega</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="clientId" label="Cliente" required className="sm:col-span-2">
            {(props) => (
              <Select
                {...props}
                value={clientId}
                onChange={(event) => handleClientChange(event.target.value)}
              >
                <option value="">Selecciona un cliente…</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="addressId"
            label="Sede de entrega"
            hint={
              selectedClient && selectedClient.addresses.length === 0
                ? "Este cliente no tiene sedes registradas"
                : undefined
            }
          >
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

          <Field id="channel" label="Canal del pedido">
            {(props) => (
              <Select
                {...props}
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as OrderChannel)
                }
              >
                {channelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field id="requestedDeliveryDate" label="Fecha de entrega solicitada">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={requestedDeliveryDate}
                onChange={(event) => setRequestedDeliveryDate(event.target.value)}
              />
            )}
          </Field>

          <Field id="notes" label="Notas" className="sm:col-span-2">
            {(props) => (
              <Textarea
                {...props}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Indicaciones de entrega, acuerdos con el cliente…"
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
          <EmptyState
            title="El pedido está vacío"
            description="Agrega al menos un producto."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Producto</th>
                  <th scope="col" className="w-28 px-4 py-2 font-medium">Cantidad</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Precio</th>
                  <th scope="col" className="w-32 px-4 py-2 font-medium">Descuento</th>
                  <th scope="col" className="w-32 px-4 py-2 text-right font-medium">Subtotal</th>
                  <th scope="col" className="w-12 px-4 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const variant = variantById.get(line.variantId);
                  const lineSubtotal = totals.lines[index]?.subtotal;
                  const hasPrice = variant?.price !== null && variant !== undefined;

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
                              {option.productName} ·{" "}
                              {PRESENTATION_SHORT[option.presentation]}
                              {option.price === null ? " (sin precio)" : ""}
                            </option>
                          ))}
                        </Select>
                      </td>

                      <td className="px-4 py-2">
                        <Input
                          aria-label={`Cantidad de la línea ${index + 1}`}
                          type="number"
                          min={0}
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.key, {
                              quantity: Number(event.target.value),
                            })
                          }
                        />
                      </td>

                      <td className="tabular px-4 py-2 text-right text-muted-foreground">
                        {variant
                          ? hasPrice
                            ? formatCOP(variant.price)
                            : "Sin precio"
                          : "—"}
                      </td>

                      <td className="px-4 py-2">
                        <Input
                          aria-label={`Descuento de la línea ${index + 1}`}
                          type="number"
                          min={0}
                          step={100}
                          value={line.discount}
                          onChange={(event) =>
                            updateLine(line.key, {
                              discount: Number(event.target.value),
                            })
                          }
                        />
                      </td>

                      <td className="tabular px-4 py-2 text-right font-medium text-foreground">
                        {lineSubtotal !== undefined ? formatCOP(lineSubtotal) : "—"}
                      </td>

                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar línea ${index + 1}`}
                          onClick={() => removeLine(line.key)}
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
                  <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">
                    Subtotal
                  </td>
                  <td className="tabular px-4 py-2 text-right">
                    {formatCOP(totals.subtotal)}
                  </td>
                  <td />
                </tr>
                {totals.discount > 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">
                      Descuentos
                    </td>
                    <td className="tabular px-4 py-2 text-right text-destructive">
                      −{formatCOP(totals.discount)}
                    </td>
                    <td />
                  </tr>
                )}
                {totals.tax > 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right text-muted-foreground">
                      IVA
                    </td>
                    <td className="tabular px-4 py-2 text-right">
                      {formatCOP(totals.tax)}
                    </td>
                    <td />
                  </tr>
                )}
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right font-semibold text-foreground">
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
          El pedido se crea en borrador. Al confirmarlo se descuenta inventario.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando…" : "Crear pedido"}
          </Button>
        </div>
      </div>
    </form>
  );
}
