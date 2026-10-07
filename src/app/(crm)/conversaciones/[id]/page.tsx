import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { getConversation } from "@/server/services/supervision";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/conversations/auto-refresh";
import { ChatMessage } from "@/components/conversations/chat-message";
import { ChatScroll } from "@/components/conversations/chat-scroll";
import { ConversationActions } from "@/components/conversations/conversation-actions";
import { ReplyForm } from "@/components/conversations/reply-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatBogotaDateTime, formatBogotaDay, formatClientCode, formatCOP } from "@/lib/format";
import {
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
  CONVERSATION_STATUS_LABEL,
  CONVERSATION_STATUS_TONE,
  DISQUALIFICATION_REASON_LABEL,
  OPPORTUNITY_STAGE_LABEL,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Conversación" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const { id } = await params;

  const conversation = await getConversation(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const client = conversation.client;
  const contactName = [conversation.contact?.firstName, conversation.contact?.lastName]
    .filter(Boolean)
    .join(" ");
  const title = client?.tradeName ?? client?.businessName ?? (contactName || `+${conversation.phone}`);
  const assignedToMe =
    conversation.status === "HUMANO" && conversation.assignedUserId === user.id;
  const canRelease = assignedToMe || user.role === "ADMIN";
  const opportunity = client?.opportunities[0] ?? null;

  const disabledReason = !assignedToMe
    ? conversation.status === "HUMANO"
      ? `La atiende ${conversation.assignedUser?.name ?? "otra persona"}. Tómala para responder.`
      : "Toma la conversación para responder: mientras tanto contesta el agente IA."
    : !conversation.window.open
      ? "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo permite plantillas aprobadas, que se envían desde n8n."
      : null;

  // Separadores por día, como en WhatsApp.
  let lastDay = "";

  return (
    <div className="space-y-5">
      <AutoRefresh versionUrl={`/api/conversaciones/${conversation.id}/version`} />
      <PageHeader
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">+{conversation.phone}</span>
            <Badge tone={CONVERSATION_STATUS_TONE[conversation.status]}>
              {CONVERSATION_STATUS_LABEL[conversation.status]}
              {conversation.status === "HUMANO" && conversation.assignedUser
                ? ` · ${conversation.assignedUser.name}`
                : ""}
            </Badge>
          </span>
        }
        actions={
          <>
            <Link href="/conversaciones" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ArrowLeft aria-hidden="true" />
              Bandeja
            </Link>
            {conversation.status !== "CERRADA" && (
              <ConversationActions
                conversationId={conversation.id}
                status={conversation.status}
                assignedToMe={assignedToMe}
                canRelease={canRelease}
              />
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col lg:col-span-2">
          <ChatScroll messageCount={conversation.messages.length}>
            {conversation.totalMessages > conversation.messages.length && (
              <p className="mb-3 text-center text-xs text-muted-foreground">
                Se muestran los últimos {conversation.messages.length} de{" "}
                {conversation.totalMessages} mensajes.
              </p>
            )}
            {conversation.messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin mensajes todavía.</p>
            ) : (
              <ol className="space-y-2" aria-label="Mensajes">
                {conversation.messages.map((message) => {
                  const day = formatBogotaDay(message.createdAt);
                  const separator = day !== lastDay;
                  lastDay = day;
                  return (
                    <ChatGroup key={message.id} day={separator ? day : null}>
                      <ChatMessage message={message} />
                    </ChatGroup>
                  );
                })}
              </ol>
            )}
          </ChatScroll>
          <div className="border-t border-border">
            <ReplyForm conversationId={conversation.id} disabledReason={disabledReason} />
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {client ? (
                <>
                  <p>
                    <Link href={`/clientes/${client.id}`} className="font-medium text-primary hover:underline">
                      {client.tradeName ?? client.businessName}
                    </Link>{" "}
                    <span className="text-muted-foreground">{formatClientCode(client.sequence)}</span>
                  </p>
                  <p>
                    <Badge tone={CLIENT_STATUS_TONE[client.status]}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
                  </p>
                  {contactName && <p className="text-muted-foreground">Contacto: {contactName}</p>}
                  <p className="text-muted-foreground">
                    Vendedor: {client.owner?.name ?? "Sin asignar"}
                  </p>
                  {opportunity ? (
                    <p>
                      <Link href={`/pipeline/${opportunity.id}`} className="text-primary hover:underline">
                        {OPPORTUNITY_STAGE_LABEL[opportunity.stage]}
                      </Link>{" "}
                      · {formatCOP(opportunity.estimatedValue)} al mes
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Sin oportunidad abierta.</p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Este número aún no está registrado como cliente.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-muted-foreground">
              <p>
                Ventana de 24 h:{" "}
                <span className="text-foreground">
                  {conversation.window.open
                    ? `abierta hasta ${formatBogotaDateTime(conversation.window.closesAt)}`
                    : "cerrada"}
                </span>
              </p>
              <p>
                Aviso de privacidad:{" "}
                <span className="text-foreground">
                  {conversation.consentAt ? formatBogotaDateTime(conversation.consentAt) : "no registrado"}
                </span>
              </p>
              <p>
                Autoriza seguimientos:{" "}
                <span className="text-foreground">
                  {conversation.marketingConsentAt ? "sí" : "no"}
                </span>
              </p>
              {conversation.optOutAt && (
                <p className="text-destructive">
                  Pidió no recibir mensajes ({formatBogotaDateTime(conversation.optOutAt)})
                </p>
              )}
              {conversation.disqualifiedReason && (
                <p>
                  Descartada: <span className="text-foreground">{DISQUALIFICATION_REASON_LABEL[conversation.disqualifiedReason]}</span>
                </p>
              )}
              <p>
                Seguimientos enviados: <span className="text-foreground">{conversation.followUpCount} de 3</span>
              </p>
            </CardContent>
          </Card>

          {conversation.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen del agente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{conversation.summary}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatGroup({ day, children }: { day: string | null; children: React.ReactNode }) {
  if (!day) return <>{children}</>;
  return (
    <>
      <li className="flex justify-center py-1" aria-hidden="true">
        <span className="rounded-full bg-card px-3 py-0.5 text-[11px] text-muted-foreground shadow-sm">
          {day}
        </span>
      </li>
      {children}
    </>
  );
}
