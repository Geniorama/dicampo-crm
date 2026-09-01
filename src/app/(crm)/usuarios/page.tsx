import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireAdminPage } from "@/server/guards";
import { listUsers } from "@/server/services/users";
import { userListQuerySchema } from "@/server/validators/users";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { UserRowActions } from "@/components/users/user-row-actions";
import { formatDate } from "@/lib/format";
import { flattenSearchParams, type RawSearchParams } from "@/lib/search-params";
import { USER_ROLE_LABEL, toOptions } from "@/lib/labels";

export const metadata: Metadata = { title: "Usuarios" };

const roleOptions = toOptions(USER_ROLE_LABEL);

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const query = userListQuerySchema.parse(flattenSearchParams(params));

  const users = await listUsers(query);
  const activeAdmins = users.filter((u) => u.role === "ADMIN" && u.active).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuarios"
        description={`${users.length} ${users.length === 1 ? "cuenta" : "cuentas"} · ${activeAdmins} ${activeAdmins === 1 ? "administrador" : "administradores"}`}
        actions={
          <Link href="/usuarios/nuevo" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nuevo usuario
          </Link>
        }
      />

      {activeAdmins === 1 && (
        <p
          role="status"
          className="rounded-md bg-warning-subtle px-4 py-3 text-sm text-warning"
        >
          Solo hay un administrador activo. Si pierde el acceso, nadie podrá
          gestionar usuarios ni precios: conviene nombrar un segundo.
        </p>
      )}

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
              defaultValue={query.search ?? ""}
              placeholder="Nombre o correo"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="role" className="text-xs font-medium text-muted-foreground">
              Rol
            </label>
            <Select id="role" name="role" defaultValue={query.role ?? ""} className="mt-1">
              <option value="">Todos</option>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="includeInactive" className="text-xs font-medium text-muted-foreground">
              Mostrar
            </label>
            <Select
              id="includeInactive"
              name="includeInactive"
              defaultValue={query.includeInactive ? "1" : "0"}
              className="mt-1"
            >
              <option value="0">Solo activos</option>
              <option value="1">Todos</option>
            </Select>
          </div>

          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        {users.length === 0 ? (
          <EmptyState
            title="No hay usuarios que coincidan"
            description="Ajusta los filtros o crea una cuenta nueva."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Usuario</th>
                  <th scope="col" className="px-4 py-2 font-medium">Rol</th>
                  <th scope="col" className="px-4 py-2 font-medium">Carga</th>
                  <th scope="col" className="px-4 py-2 font-medium">Desde</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = user.id === admin.id;

                  return (
                    <tr
                      key={user.id}
                      className="border-b border-border last:border-0 align-top"
                    >
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-2 font-medium text-foreground">
                          {user.name}
                          {isSelf && <Badge tone="primary">Tú</Badge>}
                          {!user.active && <Badge tone="neutral">Inactivo</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.email}
                          {user.phone ? ` · ${user.phone}` : ""}
                        </p>
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {USER_ROLE_LABEL[user.role]}
                      </td>

                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {/* Cuánto hay colgando de esta cuenta: ayuda a decidir
                            antes de desactivarla. */}
                        {user._count.ownedClients} clientes ·{" "}
                        {user._count.soldOrders} pedidos
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        <UserRowActions
                          userId={user.id}
                          role={user.role}
                          active={user.active}
                          isSelf={isSelf}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
