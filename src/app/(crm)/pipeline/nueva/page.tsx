import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES, scopeToOwnPortfolio } from "@/server/guards";
import { listSellerOptions } from "@/server/services/orders";
import { prisma } from "@/server/db";
import { todayInBogota } from "@/server/services/routes";
import { PageHeader } from "@/components/layout/page-header";
import { VisitForm, type ClientChoice } from "@/components/pipeline/visit-form";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Nueva visita" };

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireUserPage(SALES_ROLES);
  const params = flattenSearchParams(await searchParams);

  const advisors = user.role === "ADMIN" ? await listSellerOptions() : [];

  const [clients, products] = await Promise.all([
    prisma.client.findMany({
      where: scopeToOwnPortfolio(user),
      orderBy: { businessName: "asc" },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        addresses: {
          where: { active: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { locality: true, address: true },
        },
      },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: { flavor: "asc" },
      select: { flavor: true },
    }),
  ]);

  const options: ClientChoice[] = clients.map((client) => ({
    id: client.id,
    label: client.tradeName ?? client.businessName,
    locality: client.addresses[0]?.locality ?? null,
    address: client.addresses[0]?.address ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nueva visita"
        description="Registra una visita de demostración o de fidelización; queda en tu agenda."
      />

      <VisitForm
        clients={options}
        flavors={products.map((product) => product.flavor)}
        defaultClientId={params.clientId}
        advisors={advisors.map((advisor) => ({ id: advisor.id, name: advisor.name }))}
        defaultAdvisorId={params.advisorId ?? user.id}
        today={todayInBogota()}
      />
    </div>
  );
}
