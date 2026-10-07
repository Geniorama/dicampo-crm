"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Hand } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * Tomar la conversación (el agente deja de responder) o devolverla al
 * agente. El servidor decide quién puede; aquí solo se ofrece lo que aplica.
 */
export function ConversationActions({
  conversationId,
  status,
  assignedToMe,
  canRelease,
}: {
  conversationId: string;
  status: "BOT" | "HUMANO" | "CERRADA";
  assignedToMe: boolean;
  canRelease: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "tomar" | "liberar") {
    setError(null);
    setIsPending(true);
    try {
      await api.post(`/api/conversaciones/${conversationId}/${action}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo completar.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {!assignedToMe && (
          <Button size="sm" disabled={isPending} onClick={() => run("tomar")}>
            <Hand aria-hidden="true" />
            {status === "HUMANO" ? "Tomar yo" : "Tomar conversación"}
          </Button>
        )}
        {status === "HUMANO" && canRelease && (
          <Button size="sm" variant="secondary" disabled={isPending} onClick={() => run("liberar")}>
            <Bot aria-hidden="true" />
            Devolver al agente
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
