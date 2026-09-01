import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { getClient } from "@/server/services/clients";
import { NotFoundError } from "@/server/errors";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/components/clients/client-form";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const client = await getClient(user, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Editar ${client.tradeName ?? client.businessName}`} />
      <ClientForm
        client={{
          id: client.id,
          businessName: client.businessName,
          tradeName: client.tradeName ?? undefined,
          nit: client.nit ?? undefined,
          nitDv: client.nitDv ?? undefined,
          type: client.type,
          status: client.status,
          email: client.email ?? undefined,
          phone: client.phone ?? undefined,
          paymentTerms: client.paymentTerms,
          creditLimit: Number(client.creditLimit),
          notes: client.notes ?? undefined,
        }}
      />
    </div>
  );
}
