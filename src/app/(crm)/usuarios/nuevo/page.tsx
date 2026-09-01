import type { Metadata } from "next";
import { requireAdminPage } from "@/server/guards";
import { PageHeader } from "@/components/layout/page-header";
import { UserForm } from "@/components/users/user-form";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function NewUserPage() {
  await requireAdminPage();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nuevo usuario"
        description="Las cuentas las crea un administrador; no hay registro público."
      />
      <UserForm />
    </div>
  );
}
