import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Bloque gris pulsante que ocupa el lugar de un contenido que aún carga. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-border/70 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

/** Título y descripción de página. */
export function SkeletonHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** Fila de indicadores, con la misma rejilla que `StatCard`. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="space-y-3 p-5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-36" />
        </Card>
      ))}
    </div>
  );
}

/** Tarjeta con barra de filtros opcional y filas de tabla. */
export function SkeletonTable({
  rows = 8,
  columns = 5,
  filters = false,
}: {
  rows?: number;
  columns?: number;
  filters?: boolean;
}) {
  return (
    <Card>
      {filters && (
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          <Skeleton className="h-9 min-w-56 flex-1" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-20" />
        </div>
      )}
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-4 px-5 py-3.5">
            {Array.from({ length: columns }, (_, col) => (
              <Skeleton key={col} className={cn("h-4", col === 1 ? "flex-[2]" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Tarjeta con título y un área de gráfica. */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <div className="border-b border-border px-5 py-4">
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex h-48 items-end gap-2 px-5 py-4">
        {[40, 65, 50, 80, 60, 90].map((height, i) => (
          <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${height}%` }} />
        ))}
      </div>
    </Card>
  );
}

/** Envoltura accesible: anuncia la carga una sola vez a los lectores de pantalla. */
export function LoadingShell({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}
