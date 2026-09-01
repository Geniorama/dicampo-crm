import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES, scopeToOwnPortfolio } from "@/server/guards";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  OpportunityForm,
  type ClientChoice,
} from "@/components/pipeline/opportunity-form";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nueva oportunidad" };

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const params = flattenSearchParams(await searchParams);

  const clients = await prisma.client.findMany({
    where: scopeToOwnPortfolio(user),
    orderBy: { businessName: "asc" },
    select: { id: true, businessName: true, tradeName: true },
  });

  const options: ClientChoice[] = clients.map((client) => ({
    id: client.id,
    label: client.tradeName ?? client.businessName,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nueva oportunidad"
        description="Registra una negociación en curso para hacerle seguimiento."
      />

      {options.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay clientes disponibles"
            description="Registra primero un cliente o prospecto."
          />
        </Card>
      ) : (
        <OpportunityForm clients={options} defaultClientId={params.clientId} />
      )}
    </div>
  );
}
