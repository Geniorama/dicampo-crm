import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/guards";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { Logo } from "@/components/layout/logo";

/**
 * Layout del área privada. El middleware ya bloquea el acceso sin sesión;
 * aquí se vuelve a verificar para poder tipar el usuario en toda la sección.
 */
export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-muted">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="px-5 py-5">
          <Logo height={28} priority />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Gestión comercial
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Sidebar role={user.role} />
        </div>

        <UserMenu
          name={user.name}
          email={user.email}
          role={user.role}
          className="border-t border-border"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En móvil la barra lateral se reemplaza por un encabezado con la
            navegación desplazable horizontalmente. */}
        <div className="border-b border-border bg-card md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <Logo height={24} priority />
          </div>
          <UserMenu name={user.name} email={user.email} role={user.role} />
          <Sidebar role={user.role} orientation="horizontal" />
        </div>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
