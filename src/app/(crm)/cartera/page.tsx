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
import { PaymentForm } from "@/components/receivables/payment-form";
import { formatCOP, formatCalendarDate, formatOrderNumber } from "@/lib/format";
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

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const raw = flattenSearchParams(await searchParams);
  const query = receivablesQuerySchema.parse(raw);

  const [{ clients, totals, aging }, advisors] = await Promise.all([
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

      <section aria-label="Resumen" className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Por cobrar" value={formatCOP(totals.balance)} hint={`${totals.clientCount} clientes`} />
        <StatCard
          label="Vencido"
          value={formatCOP(totals.overdue)}
          hint={
            totals.balance > 0
              ? `${Math.round((totals.overdue / totals.balance) * 100)}% de la cartera`
              : "Sin cartera"
          }
        />
        <StatCard
          label="Antigüedad"
          value={
            aging
              .filter((row) => row.bucket !== "AL_DIA" && row.amount > 0)
              .map((row) => row.label)
              .join(" · ") || "Todo al día"
          }
          hint="Rangos con saldo vencido"
        />
      </section>

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar cliente
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
          <ul className="divide-y divide-border">
            {clients.map((client) => {
              const wa = whatsappLink(
                client.phone,
                `Hola, te escribimos de Dicampo. Tienes un saldo pendiente de ${formatCOP(client.balance)}. ¿Nos confirmas la fecha de pago? Gracias.`,
              );

              return (
                <li key={client.clientId}>
                  <details className="group" open={client.maxOverdueDays > 0 && clients.length <= 5}>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted">
                      <div>
                        <p className="font-medium text-foreground">{client.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {client.owner?.name ?? "Sin asesor"} · {client.orders.length}{" "}
                          {client.orders.length === 1 ? "pedido" : "pedidos"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {client.overCreditLimit && <Badge tone="danger">Pasa su cupo</Badge>}
                        {client.maxOverdueDays > 0 ? (
                          <Badge tone="danger">{client.maxOverdueDays} días de atraso</Badge>
                        ) : (
                          <Badge tone="success">Al día</Badge>
                        )}
                        <div className="text-right">
                          <p className="tabular font-semibold text-foreground">{formatCOP(client.balance)}</p>
                          {client.overdue > 0 && (
                            <p className="tabular text-xs text-destructive">
                              {formatCOP(client.overdue)} vencido
                            </p>
                          )}
                        </div>
                      </div>
                    </summary>

                    <div className="space-y-3 bg-muted px-5 py-4">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <Link href={`/clientes/${client.clientId}`} className="text-primary hover:underline">
                          Ver cliente
                        </Link>
                        {client.creditLimit > 0 && <span>Cupo aprobado: {formatCOP(client.creditLimit)}</span>}
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
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
                </li>
              );
            })}
          </ul>
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
