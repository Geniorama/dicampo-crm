"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MessagesSquare,
  Package,
  Truck,
  Upload,
  Users,
  UserCog,
  Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/generated/prisma/enums";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles con acceso. ADMIN siempre ve todo. */
  roles?: UserRole[];
  /**
   * Módulo aún no implementado: se muestra deshabilitado en vez de enlazar a
   * una ruta que daría 404. Quitar la bandera al crear la pantalla.
   */
  pending?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tablero", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: Target,
    roles: ["VENDEDOR"],
  },
  {
    href: "/conversaciones",
    label: "Conversaciones",
    icon: MessagesSquare,
    roles: ["VENDEDOR"],
  },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  {
    href: "/catalogo",
    label: "Catálogo",
    icon: Package,
    roles: ["VENDEDOR", "BODEGA"],
  },
  {
    href: "/inventario",
    label: "Inventario",
    icon: Boxes,
    roles: ["BODEGA"],
  },
  {
    href: "/rutas",
    label: "Rutas",
    icon: Truck,
    roles: ["DESPACHO", "BODEGA"],
  },
  { href: "/reportes", label: "Reportes", icon: BarChart3, roles: ["VENDEDOR"] },
  {
    href: "/importar",
    label: "Carga masiva",
    icon: Upload,
    // DESPACHO no tiene ninguna carga a su alcance: el enlace no le sirve.
    roles: ["VENDEDOR", "BODEGA"],
  },
  // roles: [] significa "ningún rol adicional": solo ADMIN, que ve todo.
  { href: "/usuarios", label: "Usuarios", icon: UserCog, roles: [] },
];

export function Sidebar({
  role,
  orientation = "vertical",
}: {
  role: UserRole;
  /** "horizontal" es la barra desplazable que se usa en móvil. */
  orientation?: "vertical" | "horizontal";
}) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter(
    (item) => role === "ADMIN" || !item.roles || item.roles.includes(role),
  );

  const isHorizontal = orientation === "horizontal";

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        isHorizontal
          ? "flex gap-1 overflow-x-auto px-3 py-2"
          : "space-y-0.5 px-3 py-4",
      )}
    >
      {visibleItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        const baseClasses = cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isHorizontal ? "shrink-0" : "gap-3",
        );

        if (item.pending) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title="Módulo en construcción"
              className={cn(baseClasses, "cursor-not-allowed opacity-50")}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
              <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Pronto
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              baseClasses,
              isActive
                ? "bg-primary-subtle text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
