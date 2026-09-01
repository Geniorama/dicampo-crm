import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logotipo de Dicampo.
 *
 * El archivo original mide 2063×632 con márgenes transparentes; el contenido
 * real tiene una relación de 3,56:1. Se declara el tamaño con la altura y se
 * deja que el ancho se calcule, para que nunca se deforme.
 */

/** Relación ancho/alto del archivo completo, márgenes incluidos. */
const ASPECT_RATIO = 2063 / 632;

export function Logo({
  height = 32,
  className,
  priority = false,
}: {
  /** Altura en píxeles; el ancho se deriva de la proporción. */
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/dicampo-logo.png"
      alt="Dicampo"
      width={Math.round(height * ASPECT_RATIO)}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto", className)}
      style={{ height }}
    />
  );
}
