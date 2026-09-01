import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getOpportunity } from "@/server/services/pipeline";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StageSelector } from "@/components/pipeline/stage-selector";
import { ActivityForm } from "@/components/pipeline/activity-form";
import { CompleteActivityButton } from "@/components/pipeline/complete-activity-button";
import { formatCOP, formatDate, formatDateTime } from "@/lib/format";
import {
  ACTIVITY_TYPE_LABEL,
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
  OPPORTUNITY_STAGE_LABEL,
} from "@/lib/labels";
import { isClosedStage } from "@/lib/pipeline-stages";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Oportunidad" };

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const opportunity = await getOpportunity(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const client = opportunity.client;
  const clientName = client.tradeName ?? client.businessName;
  const primaryContact = client.contacts[0];
  const waLink = whatsappLink(
    primaryContact?.whatsapp ?? primaryContact?.phone ?? client.phone,
  );

  const pending = opportunity.activities.filter((a) => !a.completedAt);
  const done = opportunity.activities.filter((a) => a.completedAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title={opportunity.title}
        description={
          <>
            {clientName} · {OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
          </>
        }
        actions={
          waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "secondary" })}
            >
              <MessageCircle aria-hidden="true" />
              WhatsApp
            </a>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Registrar actividad</CardTitle>
            </CardHeader>
            <ActivityForm opportunityId={opportunity.id} />
          </Card>

          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pendientes</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border">
                {pending.map((activity) => {
                  const isOverdue =
                    activity.dueAt !== null && activity.dueAt < new Date();

                  return (
                    <li
                      key={activity.id}
                      className="flex items-center justify-between gap-4 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {activity.subject}
                        </p>
                        <p className="text-xs">
                          <span className="text-muted-foreground">
                            {ACTIVITY_TYPE_LABEL[activity.type]} ·{" "}
                            {activity.user.name}
                          </span>
                          {activity.dueAt && (
                            <span
                              className={
                                isOverdue
                                  ? " text-destructive"
                                  : " text-muted-foreground"
                              }
                            >
                              {" "}
                              · {isOverdue ? "vencía" : "para"}{" "}
                              {formatDate(activity.dueAt)}
                            </span>
                          )}
                        </p>
                      </div>
                      <CompleteActivityButton activityId={activity.id} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>

            {done.length === 0 ? (
              <EmptyState
                title="Sin actividad registrada"
                description="Anota cada llamada, visita o muestra para no perder el hilo."
              />
            ) : (
              <ul className="divide-y divide-border">
                {done.map((activity) => (
                  <li key={activity.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {activity.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ACTIVITY_TYPE_LABEL[activity.type]} · {activity.user.name}{" "}
                      · {formatDateTime(activity.completedAt)}
                    </p>
                    {activity.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activity.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Etapa</CardTitle>
              {isClosedStage(opportunity.stage) && (
                <Badge
                  tone={opportunity.stage === "GANADA" ? "success" : "danger"}
                >
                  {OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <StageSelector
                opportunityId={opportunity.id}
                stage={opportunity.stage}
              />

              {opportunity.lostReason && (
                <p className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive">
                  Perdida: {opportunity.lostReason}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <DataRow label="Cliente">
                  <Link
                    href={`/clientes/${client.id}`}
                    className="text-primary hover:underline"
                  >
                    {clientName}
                  </Link>
                </DataRow>
                <DataRow label="Estado del cliente">
                  <Badge tone={CLIENT_STATUS_TONE[client.status]}>
                    {CLIENT_STATUS_LABEL[client.status]}
                  </Badge>
                </DataRow>
                <DataRow label="Contacto">
                  {primaryContact
                    ? `${primaryContact.firstName} ${primaryContact.lastName ?? ""}`.trim()
                    : "Sin contacto"}
                </DataRow>
                <DataRow label="Valor estimado">
                  {formatCOP(opportunity.estimatedValue)} / mes
                </DataRow>
                <DataRow label="Responsable">
                  {opportunity.owner?.name ?? "Sin asignar"}
                </DataRow>
                <DataRow label="Cierre esperado">
                  {formatDate(opportunity.expectedCloseDate)}
                </DataRow>
                {opportunity.closedAt && (
                  <DataRow label="Cerrada el">
                    {formatDate(opportunity.closedAt)}
                  </DataRow>
                )}
                <DataRow label="Creada">
                  {formatDate(opportunity.createdAt)}
                </DataRow>
              </dl>

              {opportunity.notes && (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {opportunity.notes}
                </p>
              )}
            </CardContent>
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
