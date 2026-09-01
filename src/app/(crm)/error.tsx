"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Límite de error del área privada. Muestra un mensaje entendible en vez de
 * la traza técnica; los errores de dominio (permisos, reglas de negocio) ya
 * traen un mensaje redactado para el usuario.
 */
export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[crm]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">
        No pudimos cargar esta sección
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "Ocurrió un error inesperado."}
      </p>
      <Button className="mt-5" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
