import Link from "next/link";
import type { Metadata } from "next";
import { Bot, Headset, User } from "lucide-react";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { listAdvisors, listConversations } from "@/server/services/supervision";
import { conversationListQuerySchema } from "@/server/validators/conversations";
import { PageHeader } from "@/components/layout/page-header";
import { AutoRefresh } from "@/components/conversations/auto-refresh";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { formatBogotaDateTime } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import {
  CONVERSATION_STATUS_LABEL,
  CONVERSATION_STATUS_TONE,
  DISQUALIFICATION_REASON_LABEL,
  MESSAGE_TYPE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  toOptions,
} from "@/lib/labels";

export const metadata: Metadata = { title: "Conversaciones" };

const statusOptions = toOptions(CONVERSATION_STATUS_LABEL);
const stageOptions = toOptions(OPPORTUNITY_STAGE_LABEL);

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const params = await searchParams;

  const parsed = conversationListQuerySchema.safeParse(flattenSearchParams(params));
  const query = parsed.success ? parsed.data : conversationListQuerySchema.parse({});
  const [{ items, total, page, totalPages }, advisors] = await Promise.all([
    listConversations(user, query),
    listAdvisors(user),
  ]);
  const flat = flattenSearchParams(params);

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={30_000} />
      <PageHeader
        title="Conversaciones"
        description={`${total} ${total === 1 ? "conversación" : "conversaciones"} de WhatsApp en tu alcance`}
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={flat.search ?? ""}
              placeholder="Cliente, contacto o teléfono"
              className="mt-1"
            />
          </div>
          <FilterSelect id="status" label="Estado" value={flat.status} options={statusOptions} />
          <FilterSelect id="stage" label="Etapa" value={flat.stage} options={stageOptions} />
          {advisors.length > 1 && (
            <FilterSelect
              id="assignedUserId"
              label="Asesor"
              value={flat.assignedUserId}
              options={advisors.map((a) => ({ value: a.id, label: a.name }))}
            />
          )}
          <div>
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              Desde
            </label>
            <Input id="from" name="from" type="date" defaultValue={flat.from ?? ""} className="mt-1" />
          </div>
          <div>
            <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              Hasta
            </label>
            <Input id="to" name="to" type="date" defaultValue={flat.to ?? ""} className="mt-1" />
          </div>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {items.length === 0 ? (
          <EmptyState
            title="No hay conversaciones que coincidan"
            description="Las conversaciones aparecen aquí cuando el agente de WhatsApp las registra."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((conversation) => {
              const name =
                conversation.client?.tradeName ??
                conversation.client?.businessName ??
                ([conversation.contact?.firstName, conversation.contact?.lastName]
                  .filter(Boolean)
                  .join(" ") || `+${conversation.phone}`);
              const last = conversation.lastMessage;
              const AuthorIcon =
                last?.author === "CLIENTE" ? User : last?.author === "ASESOR" ? Headset : Bot;

              return (
                <li key={conversation.id}>
                  <Link
                    href={`/conversaciones/${conversation.id}`}
                    className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{name}</span>
                        <Badge tone={CONVERSATION_STATUS_TONE[conversation.status]}>
                          {CONVERSATION_STATUS_LABEL[conversation.status]}
                        </Badge>
                        {conversation.client?.openOpportunity && (
                          <Badge tone="primary">
                            {OPPORTUNITY_STAGE_LABEL[conversation.client.openOpportunity.stage]}
                          </Badge>
                        )}
                        {conversation.disqualifiedReason && (
                          <Badge tone="neutral">
                            {DISQUALIFICATION_REASON_LABEL[conversation.disqualifiedReason]}
                          </Badge>
                        )}
                        {conversation.optOutAt && <Badge tone="danger">Pidió no recibir mensajes</Badge>}
                      </p>
                      {last && (
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                          <AuthorIcon className="size-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {last.body ?? MESSAGE_TYPE_LABEL[last.type]}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="tabular">{formatBogotaDateTime(conversation.lastMessageAt)}</p>
                      <p>
                        {conversation.status === "HUMANO"
                          ? (conversation.assignedUser?.name ?? "Sin asesor")
                          : (conversation.client?.owner?.name ?? "Sin vendedor")}
                      </p>
                      <p className="tabular">+{conversation.phone}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Paginación"
            className="flex items-center justify-between border-t border-border px-4 py-3 text-sm"
          >
            <p className="text-muted-foreground">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && <PageLink params={flat} page={page - 1} label="Anterior" />}
              {page < totalPages && <PageLink params={flat} page={page + 1} label="Siguiente" />}
            </div>
          </nav>
        )}
      </Card>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
}: {
  id: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select id={id} name={id} defaultValue={value ?? ""} className="mt-1">
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function PageLink({
  params,
  page,
  label,
}: {
  params: Record<string, string>;
  page: number;
  label: string;
}) {
  const search = new URLSearchParams({ ...params, page: String(page) });
  return (
    <Link
      href={`/conversaciones?${search.toString()}`}
      className="rounded-md border border-border px-3 py-1.5 text-muted-foreground hover:bg-muted"
    >
      {label}
    </Link>
  );
}
