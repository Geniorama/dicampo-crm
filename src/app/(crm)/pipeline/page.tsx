import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/guards";
import { listOpportunities } from "@/server/services/pipeline";
import { opportunityListQuerySchema } from "@/server/validators/pipeline";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StageSelector } from "@/components/pipeline/stage-selector";
import { formatCOP, formatDate } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { isClosedStage } from "@/lib/pipeline-stages";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = opportunityListQuerySchema.parse(flattenSearchParams(params));

  const { columns, total, value } = await listOpportunities(user, query);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        description={`${total} ${total === 1 ? "oportunidad" : "oportunidades"} · ${formatCOP(value)} estimados al mes`}
        actions={
          <Link href="/pipeline/nueva" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva oportunidad
          </Link>
        }
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-56 flex-1">
            <label htmlFor="search" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={query.search ?? ""}
              placeholder="Título de la oportunidad o cliente"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="includeClosed" className="text-xs font-medium text-muted-foreground">
              Mostrar
            </label>
            <Select
              id="includeClosed"
              name="includeClosed"
              defaultValue={query.includeClosed ? "1" : "0"}
              className="mt-1"
            >
              <option value="0">Solo abiertas</option>
              <option value="1">Incluir cerradas</option>
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
      </Card>

      {/* El tablero se desplaza en horizontal: las columnas no se comprimen
          hasta volverse ilegibles en pantallas estrechas. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {columns.map((column) => (
            <section
              key={column.stage}
              aria-label={OPPORTUNITY_STAGE_LABEL[column.stage]}
              className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
            >
              <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {OPPORTUNITY_STAGE_LABEL[column.stage]}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {column.total}
                </span>
              </header>

              {column.value > 0 && (
                <p className="tabular border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  {formatCOP(column.value)} / mes
                </p>
              )}

              <div className="flex-1 space-y-2 p-2">
                {column.items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Sin oportunidades
                  </p>
                ) : (
                  column.items.map((item) => (
                    <article
                      key={item.id}
                      className="space-y-2 rounded-md border border-border bg-background p-3"
                    >
                      <Link
                        href={`/pipeline/${item.id}`}
                        className="block text-sm font-medium text-primary hover:underline"
                      >
                        {item.title}
                      </Link>

                      <p className="text-xs text-muted-foreground">
                        {item.client.tradeName ?? item.client.businessName}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="tabular font-medium text-foreground">
                          {formatCOP(item.estimatedValue)}
                        </span>
                        {item.expectedCloseDate && (
                          <span className="text-muted-foreground">
                            cierra {formatDate(item.expectedCloseDate)}
                          </span>
                        )}
                      </div>

                      {item.lostReason && (
                        <p className="rounded bg-destructive-subtle px-2 py-1 text-xs text-destructive">
                          {item.lostReason}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <Badge tone="neutral">
                          {item._count.activities}{" "}
                          {item._count.activities === 1 ? "actividad" : "actividades"}
                        </Badge>
                        {item.owner && (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.owner.name}
                          </span>
                        )}
                      </div>

                      {/* Las cerradas se mueven desde su ficha, para no
                          reabrirlas por accidente desde el tablero. */}
                      {!isClosedStage(item.stage) && (
                        <StageSelector
                          opportunityId={item.id}
                          stage={item.stage}
                          compact
                        />
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
