import { LoadingShell, SkeletonHeader, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Esqueleto por defecto del área privada. Next lo muestra al navegar a
 * cualquier pantalla que no tenga el suyo; la forma de listado (título, filtros
 * y tabla) es la más común.
 */
export default function CrmLoading() {
  return (
    <LoadingShell>
      <SkeletonHeader />
      <SkeletonTable filters />
    </LoadingShell>
  );
}
