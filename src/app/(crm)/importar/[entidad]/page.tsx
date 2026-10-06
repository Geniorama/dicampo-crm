import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Info } from "lucide-react";
import { isImportEntityKey } from "@/lib/import/entities";
import { authorizeImportPage } from "@/server/import/access";
import { getImportEntity } from "@/server/services/imports";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ImportWizard } from "@/components/import/import-wizard";

type Props = { params: Promise<{ entidad: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entidad } = await params;
  if (!isImportEntityKey(entidad)) return { title: "Carga masiva" };

  return { title: `Importar ${getImportEntity(entidad).label.toLowerCase()}` };
}

export default async function ImportEntityPage({ params }: Props) {
  const { entidad } = await params;
  // Redirige si el rol no alcanza; 404 si la entidad no existe.
  const { key } = await authorizeImportPage(entidad);
  const entity = getImportEntity(key);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Importar ${entity.label.toLowerCase()}`}
        description={entity.description}
        actions={
          <Link
            href="/importar"
            className={buttonVariants({ variant: "secondary" })}
          >
            <ArrowLeft aria-hidden="true" />
            Otras cargas
          </Link>
        }
      />

      {entity.notes && entity.notes.length > 0 && (
        <div className="rounded-lg border border-border bg-info-subtle px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-info">
            <Info className="size-4" aria-hidden="true" />
            Antes de empezar
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {entity.notes.map((note) => (
              <li key={note} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ImportWizard entity={entity} />
    </div>
  );
}
