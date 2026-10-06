import Link from "next/link";
import { Upload } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ImportEntityKey } from "@/lib/import/entities";
import { importAccess } from "@/server/import/registry";
import { canImport } from "@/server/services/imports";
import type { SessionUser } from "@/server/guards";

/**
 * Acceso a la carga masiva desde la cabecera de un módulo.
 *
 * La herramienta es una sola y vive en `/importar`, pero se entra por el
 * módulo: quien está mirando la lista de clientes no tiene por qué saber que
 * existe una pantalla aparte para subirlos.
 *
 * El enlace se comprueba contra el mismo permiso que protege la pantalla, así
 * que no puede quedar a la vista un botón que acabe en una redirección.
 */
export function ImportLink({
  entity,
  user,
  label = "Importar",
}: {
  entity: ImportEntityKey;
  user: SessionUser;
  label?: string;
}) {
  if (!canImport(user, importAccess(entity))) return null;

  return (
    <Link
      href={`/importar/${entity}`}
      className={buttonVariants({ variant: "secondary" })}
    >
      <Upload aria-hidden="true" />
      {label}
    </Link>
  );
}
