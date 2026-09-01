import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function CrmNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        No encontramos lo que buscas
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        El registro no existe o fue eliminado.
      </p>
      <Link href="/dashboard" className={`${buttonVariants()} mt-5`}>
        Volver al tablero
      </Link>
    </div>
  );
}
