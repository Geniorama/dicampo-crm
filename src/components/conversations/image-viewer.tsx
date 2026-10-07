"use client";

import { useRef } from "react";
import { X } from "lucide-react";

/** Miniatura que se amplía en un diálogo nativo (Esc o clic fuera cierran). */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="block overflow-hidden rounded-md focus-visible:outline-2"
        aria-label="Ampliar imagen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y temporal: no pasa por el optimizador de Next */}
        <img src={src} alt={alt} className="max-h-60 max-w-full object-contain" loading="lazy" />
      </button>
      <dialog
        ref={dialog}
        className="m-auto max-h-[90vh] max-w-[90vw] rounded-lg bg-transparent p-0 backdrop:bg-black/70"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- ver arriba */}
        <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] object-contain" />
      </dialog>
    </>
  );
}
