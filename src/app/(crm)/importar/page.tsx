import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Upload } from "lucide-react";
import { requireUserPage } from "@/server/guards";
import { listImportEntities } from "@/server/services/imports";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Carga masiva" };

/**
 * Índice de cargas masivas.
 *
 * Solo se listan las que el rol puede ejecutar: los permisos son los mismos
 * de cada módulo, así que a un vendedor no le aparece la carga de precios.
 */
export default async function ImportIndexPage() {
  const user = await requireUserPage();
  const entities = listImportEntities(user);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Carga masiva"
        description="Sube información desde un archivo CSV o Excel. No hace falta una plantilla: cotejas tus columnas con los campos del CRM."
      />

      {entities.length === 0 ? (
        <Card>
          <EmptyState
            title="No tienes cargas disponibles"
            description="Tu rol no habilita ninguna importación."
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entities.map((entity) => (
            <li key={entity.key}>
              <Link
                href={`/importar/${entity.key}`}
                className="flex h-full items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted"
              >
                <span className="mt-0.5 rounded-md bg-primary-subtle p-2 text-primary">
                  <Upload className="size-4" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {entity.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entity.moduleLabel}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {entity.description}
                  </span>
                </span>

                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
