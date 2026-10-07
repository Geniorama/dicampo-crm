import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getClient } from "@/server/services/clients";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  formatCOP,
  formatClientCode,
  formatCalendarDate, formatDate,
  formatDateTime,
  formatNit,
  formatOrderNumber,
} from "@/lib/format";
import {
  ACTIVITY_TYPE_LABEL,
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
  CLIENT_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  OPPORTUNITY_STAGE_LABEL,
  PAYMENT_TERMS_LABEL,
} from "@/lib/labels";
import { ActivityForm } from "@/components/pipeline/activity-form";
import { ContactManager } from "@/components/clients/contact-manager";
import { AddressManager } from "@/components/clients/address-manager";
import { prisma } from "@/server/db";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientDetailPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const [client, zones] = await Promise.all([
    getClient(user, id).catch((error) => {
      // Un cliente inexistente es un 404 de la aplicación, no un fallo.
      if (error instanceof NotFoundError) notFound();
      throw error;
    }),
    prisma.deliveryZone.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={client.tradeName ?? client.businessName}
        description={`${formatClientCode(client.sequence)} · ${CLIENT_TYPE_LABEL[client.type]}`}
        actions={
          <Link
            href={`/clientes/${client.id}/editar`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Pencil aria-hidden="true" />
            Editar
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Contactos</CardTitle>
            </CardHeader>

            <ContactManager clientId={client.id} contacts={client.contacts} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sedes de entrega</CardTitle>
            </CardHeader>

            <AddressManager
              clientId={client.id}
              addresses={client.addresses}
              zones={zones}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Oportunidades</CardTitle>
              <Link
                href={`/pipeline/nueva?clientId=${client.id}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Nueva oportunidad
              </Link>
            </CardHeader>

            {client.opportunities.length === 0 ? (
              <EmptyState
                title="Sin oportunidades abiertas"
                description="Registra una negociación para hacerle seguimiento en el pipeline."
              />
            ) : (
              <ul className="divide-y divide-border">
                {client.opportunities.map((opportunity) => (
                  <li
                    key={opportunity.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/pipeline/${opportunity.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {opportunity.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatCOP(opportunity.estimatedValue)} / mes
                        {opportunity.expectedCloseDate
                          ? ` · cierra ${formatCalendarDate(opportunity.expectedCloseDate)}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        opportunity.stage === "GANADA"
                          ? "success"
                          : opportunity.stage === "PERDIDA"
                            ? "danger"
                            : "info"
                      }
                    >
                      {OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pedidos recientes</CardTitle>
              <Link
                href={`/pedidos?clientId=${client.id}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            </CardHeader>

            {client.orders.length === 0 ? (
              <EmptyState title="Este cliente aún no tiene pedidos" />
            ) : (
              <ul className="divide-y divide-border">
                {client.orders.map((order) => (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div>
                      <Link
                        href={`/pedidos/${order.id}`}
                        className="tabular text-sm font-medium text-primary hover:underline"
                      >
                        {formatOrderNumber(order.orderNumber)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(order.orderDate)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                      <span className="tabular text-sm font-medium text-foreground">
                        {formatCOP(order.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Información</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <DataRow label="Estado">
                  <Badge tone={CLIENT_STATUS_TONE[client.status]}>
                    {CLIENT_STATUS_LABEL[client.status]}
                  </Badge>
                </DataRow>
                <DataRow label="Razón social">{client.businessName}</DataRow>
                <DataRow label="NIT">
                  {formatNit(client.nit, client.nitDv)}
                </DataRow>
                <DataRow label="Teléfono">{client.phone ?? "—"}</DataRow>
                <DataRow label="Correo">{client.email ?? "—"}</DataRow>
                <DataRow label="Vendedor">
                  {client.owner?.name ?? "Sin asignar"}
                </DataRow>
                <DataRow label="Condición de pago">
                  {PAYMENT_TERMS_LABEL[client.paymentTerms]}
                </DataRow>
                <DataRow label="Cupo de crédito">
                  {formatCOP(client.creditLimit)}
                </DataRow>
                <DataRow label="Lista de precios">
                  {client.priceList?.name ?? "Por defecto"}
                </DataRow>
                <DataRow label="Cliente desde">
                  {formatDate(client.createdAt)}
                </DataRow>
              </dl>

              {client.notes && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {client.notes}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actividad</CardTitle>
            </CardHeader>

            <ActivityForm clientId={client.id} />

            {client.activities.length === 0 ? (
              <EmptyState title="Sin actividad registrada" />
            ) : (
              <ul className="divide-y divide-border">
                {client.activities.map((activity) => (
                  <li key={activity.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {activity.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ACTIVITY_TYPE_LABEL[activity.type]} ·{" "}
                      {activity.user.name} · {formatDateTime(activity.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}
