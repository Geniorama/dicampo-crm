"use client";

import { useEffect, useRef } from "react";

/**
 * Contenedor del chat que arranca abajo, en el mensaje más reciente, y baja
 * solo cuando llegan mensajes nuevos si la persona ya estaba al final: si
 * subió a leer el historial, no se le mueve la pantalla.
 */
export function ChatScroll({
  messageCount,
  children,
}: {
  messageCount: number;
  children: React.ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const firstRender = useRef(true);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (firstRender.current || atBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
    firstRender.current = false;
  }, [messageCount]);

  return (
    <div
      ref={container}
      onScroll={(event) => {
        const el = event.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="flex-1 overflow-y-auto bg-muted/40 px-3 py-4 sm:px-5"
      style={{ maxHeight: "65vh" }}
    >
      {children}
    </div>
  );
}
