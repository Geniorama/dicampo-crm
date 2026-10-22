"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión del navegador: ahí se elige "Guardar como PDF". */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      Imprimir / guardar PDF
    </Button>
  );
}
