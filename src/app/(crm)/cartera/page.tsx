import Link from "next/link";
import type { Metadata } from "next";
import { SALES_ROLES, requireUserPage } from "@/server/guards";
import { prisma } from "@/server/db";
import { listReceivables } from "@/server/services/receivables";
import { receivablesQuerySchema } from "@/server/validators/payments";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { CollectionForm } from "@/components/receivables/collection-form";
import { PaymentForm } from "@/components/receivables/payment-form";
import { formatCOP, formatCalendarDate, formatDate, formatOrderNumber } from "@/lib/format";
import {
  CLIENT_TYPE_LABEL,
  COLLECTION_PRIORITY_LABEL,
  COLLECTION_PRIORITY_TONE,
  COLLECTION_STATUS_LABEL,
  PAYMENT_BLOCK_LABEL,
  toOptions,
} from "@/lib/labels";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { whatsappLink } from "@/lib/whatsapp";
import { AGING_LABEL, type AgingBucket } from "@/lib/receivables";

export const metadata: Metadata = { title: "Cartera" };

const BUCKET_TONE: Record<AgingBucket, BadgeTone> = {
  AL_DIA: "success",
  "1_30": "warning",
  "31_60": "danger",
  MAS_60: "danger",
};

const MONTH_OPTIONS = [
  { value: "1", label: "Último mes" },
  { value: "3", label: "Últimos 3 meses" },
  { value: "6", label: "Últimos 6 meses" },
];

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const raw = flattenSearchParams(await searchParams);
  // Un filtro vacío ("Todos") llega como cadena vacía: se trata como ausente.
  const clean = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""));
  const query = receivablesQuerySchema.parse(clean);

  const [{ clients, cards, aging }, advisors] = await Promise.all([
    listReceivables(user, query),
    user.role === "ADMIN"
      ? prisma.user.findMany({
          where: { active: true, role: "VENDEDOR" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cartera"
        description="Pedidos entregados con saldo por cobrar. El plazo corre desde el día de entrega."
      />

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Por cobrar" value={formatCOP(cards.total.amount)} hint={`${cards.total.clients} clientes`} />
        <StatCard
          label="Superdistribuidores"
          value={formatCOP(cards.superDistributors.amount)}
          hint={`${cards.superDistributors.clients} clientes`}
        />
        <StatCard
          label="Remisiones equipo comercial"
          value={formatCOP(cards.teamRemissions.amount)}
          hint={`${cards.teamRemissions.clients} clientes`}
        />
        <StatCard
          label="Facturas equipo comercial"
          value={formatCOP(cards.teamInvoices.amount)}
          hint={`${cards.teamInvoices.clients} clientes`}
        />
      </section>

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Cliente
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              className="mt-1"
              placeholder="Razón social o nombre comercial"
            />
          </div>

          {advisors.length > 0 && (
            <div>
              <label htmlFor="ownerId" className="text-xs font-medium text-muted-foreground">
                Asesor
              </label>
              <Select id="ownerId" name="ownerId" defaultValue={query.ownerId ?? ""} className="mt-1">
                <option value="">Todos</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label htmlFor="clientType" className="text-xs font-medium text-muted-foreground">
              Tipo de cliente
            </label>
            <Select id="clientType" name="clientType" defaultValue={query.clientType ?? ""} className="mt-1">
              <option value="">Todos</option>
              {toOptions(CLIENT_TYPE_LABEL).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="collectionStatus" className="text-xs font-medium text-muted-foreground">
              Estado
            </label>
            <Select
              id="collectionStatus"
              name="collectionStatus"
              defaultValue={query.collectionStatus ?? ""}
              className="mt-1"
            >
              <option value="">Todos</option>
              {toOptions(COLLECTION_STATUS_LABEL).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="months" className="text-xs font-medium text-muted-foreground">
              Entregas
            </label>
            <Select id="months" name="months" defaultValue={query.months ? String(query.months) : ""} className="mt-1">
              <option value="">Todo el histórico</option>
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
            <input type="checkbox" name="overdueOnly" value="1" defaultChecked={query.overdueOnly} />
            Solo vencidos
          </label>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {clients.length === 0 ? (
          <EmptyState
            title="No hay cartera para cobrar"
            description="Aquí aparecen los pedidos entregados que aún tienen saldo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-3 py-2 font-medium">Contacto</th>
                  <th scope="col" className="px-3 py-2 font-medium">Celular</th>
                  <th scope="col" className="px-3 py-2 font-medium">Localidad</th>
                  <th scope="col" className="px-3 py-2 font-medium">Asesor</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Facturas pendientes</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Remisión</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Factura</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Total a cobrar</th>
                  <th scope="col" className="px-3 py-2 font-medium">Más antigua</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Días de mora</th>
                  <th scope="col" className="px-4 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              {clients.map((client) => {
                const wa = whatsappLink(
                  client.mobile,
                  `Hola, te escribimos de Dicampo. Tienes un saldo pendiente de ${formatCOP(client.balance)}. ¿Nos confirmas la fecha de pago? Gracias.`,
                );

                return (
                  <tbody key={client.clientId} className="border-b border-border last:border-0">
                    <tr className="align-top hover:bg-muted">
                      <td className="px-4 py-2.5">
                        <Link href={`/clientes/${client.clientId}`} className="font-medium text-primary hover:underline">
                          {client.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={COLLECTION_PRIORITY_TONE[client.priority]}>
                            {COLLECTION_PRIORITY_LABEL[client.priority]}
                          </Badge>
                          {client.blocked && <Badge tone="danger">{PAYMENT_BLOCK_LABEL}</Badge>}
                          {client.overCreditLimit && <Badge tone="danger">Pasa su cupo</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{client.contactName ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{client.mobile ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{client.locality ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{client.owner?.name ?? "Sin asesor"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{client.pendingCount}</td>
                      <td className="tabular px-3 py-2.5 text-right">{formatCOP(client.remissionBalance)}</td>
                      <td className="tabular px-3 py-2.5 text-right">{formatCOP(client.invoiceBalance)}</td>
                      <td className="tabular px-3 py-2.5 text-right font-semibold">{formatCOP(client.balance)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {client.oldestDeliveredAt ? formatDate(client.oldestDeliveredAt) : "—"}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">
                        {client.maxOverdueDays > 0 ? (
                          <span className="font-medium text-destructive">{client.maxOverdueDays}</span>
                        ) : (
                          "Al día"
                        )}
                      </td>
                      <td className="px-4 py-2.5">{COLLECTION_STATUS_LABEL[client.collectionStatus]}</td>
                    </tr>
                    <tr>
                      <td colSpan={12} className="px-4 pb-3">
                        <details open={client.maxOverdueDays > 0 && clients.length <= 3}>
                          <summary className="cursor-pointer text-xs font-medium text-primary">
                            Gestionar cobro y registrar pagos
                          </summary>
                          <div className="mt-3 space-y-3 rounded-md bg-muted p-4">
                            <CollectionForm
                              clientId={client.clientId}
                              name={client.name}
                              status={client.collectionStatus}
                              note={client.collectionNote}
                            />
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {client.creditLimit > 0 && <span>Cupo aprobado: {formatCOP(client.creditLimit)}</span>}
                              {wa && (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  Recordar por WhatsApp
                                </a>
                              )}
                            </div>

                            <ul className="space-y-3">
                              {client.orders.map((order) => (
                                <li key={order.id} className="rounded-md bg-card p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <div>
                                      <Link
                                        href={`/pedidos/${order.id}`}
                                        className="tabular font-medium text-primary hover:underline"
                                      >
                                        {formatOrderNumber(order.orderNumber)}
                                      </Link>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        vence {formatCalendarDate(order.due)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge tone={BUCKET_TONE[order.bucket]}>{AGING_LABEL[order.bucket]}</Badge>
                                      <span className="tabular font-medium">{formatCOP(order.balance)}</span>
                                      {order.paid > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          (pagó {formatCOP(order.paid)} de {formatCOP(order.total)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <PaymentForm
                                      orderId={order.id}
                                      orderNumber={formatOrderNumber(order.orderNumber)}
                                      balance={order.balance}
                                    />
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      </td>
                    </tr>
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </Card>

      {aging.some((row) => row.amount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Antigüedad de la cartera</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-4">
              {aging.map((row) => (
                <div key={row.bucket}>
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="tabular text-lg font-semibold text-foreground">{formatCOP(row.amount)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
