import type { Metadata } from "next";
import { requireUser } from "@/server/guards";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "@/components/clients/client-form";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nuevo cliente"
        description="Registra el negocio; después podrás añadirle contactos y sedes de entrega."
      />
      <ClientForm />
    </div>
  );
}
