import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES } from "@/server/guards";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/components/clients/client-form";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  const user = await requireUserPage(SALES_ROLES);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nuevo cliente"
        description="Registra el negocio; después podrás añadirle contactos y sedes de entrega."
      />
      <ClientForm
        canEditNegotiation={user.role === "ADMIN"}
        canEditBillingMode={user.role === "ADMIN"}
        canEditSuperDistributor={user.role === "ADMIN"}
      />
    </div>
  );
}
