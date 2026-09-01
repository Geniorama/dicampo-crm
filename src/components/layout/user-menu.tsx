"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { USER_ROLE_LABEL } from "@/lib/labels";
import type { UserRole } from "@/generated/prisma/enums";

export function UserMenu({
  name,
  email,
  role,
  className,
}: {
  name: string;
  email: string;
  role: UserRole;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", className)}>
      <div
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary"
      >
        {name.slice(0, 1).toUpperCase()}
      </div>

      <Link
        href="/perfil"
        className="min-w-0 flex-1 rounded-md hover:opacity-80"
        title="Ver mi perfil"
      >
        <p className="truncate text-sm font-medium text-foreground" title={email}>
          {name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {USER_ROLE_LABEL[role]}
        </p>
      </Link>

      <Button
        variant="ghost"
        size="icon"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut aria-hidden="true" />
      </Button>
    </div>
  );
}
