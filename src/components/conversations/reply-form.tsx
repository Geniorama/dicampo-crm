"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

/**
 * Respuesta del asesor. Si no se puede escribir (no tomó la conversación o
 * pasaron 24 h), se explica en vez de mostrar un formulario que va a fallar.
 */
export function ReplyForm({
  conversationId,
  disabledReason,
}: {
  conversationId: string;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">{disabledReason}</p>;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setIsPending(true);
    try {
      await api.post(`/api/conversaciones/${conversationId}/mensajes`, { texto: text });
      setText("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo enviar.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex items-end gap-2 p-3">
      <div className="flex-1">
        <label htmlFor="reply" className="sr-only">
          Mensaje para el cliente
        </label>
        <Textarea
          id="reply"
          rows={2}
          maxLength={4096}
          value={text}
          placeholder="Escribe tu respuesta…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter envía; Shift+Enter hace salto de línea, como en WhatsApp Web.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {error && (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isPending || !text.trim()}>
        <Send aria-hidden="true" />
        {isPending ? "Enviando…" : "Enviar"}
      </Button>
    </form>
  );
}
