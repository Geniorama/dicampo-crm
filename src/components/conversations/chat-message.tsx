import { Bot, FileText, Headset, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBogotaTime } from "@/lib/format";
import { MESSAGE_TYPE_LABEL } from "@/lib/labels";
import type { ConversationDetail } from "@/server/services/supervision";
import { ImageViewer } from "./image-viewer";

type Message = ConversationDetail["messages"][number];

const DELIVERY_LABEL: Record<string, string> = {
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "No se entregó",
};

/**
 * Burbuja del chat. El cliente va a la izquierda; el agente y el asesor a la
 * derecha, con colores distintos para saber de un vistazo quién respondió.
 */
export function ChatMessage({ message }: { message: Message }) {
  const fromClient = message.author === "CLIENTE";
  const fromAgent = message.author === "AGENTE_IA";

  return (
    <li className={cn("flex", fromClient ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
          fromClient && "rounded-tl-none border border-border bg-card",
          fromAgent && "rounded-tr-none bg-info-subtle",
          message.author === "ASESOR" && "rounded-tr-none bg-primary-subtle",
        )}
      >
        {!fromClient && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {fromAgent ? (
              <>
                <Bot className="size-3.5" aria-hidden="true" /> Agente IA
              </>
            ) : (
              <>
                <Headset className="size-3.5" aria-hidden="true" />{" "}
                {message.authorUser?.name ?? "Asesor"}
              </>
            )}
          </p>
        )}

        <MessageMedia message={message} />

        {message.body && (
          <p className="whitespace-pre-wrap break-words text-foreground">{message.body}</p>
        )}

        <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          {message.type !== "TEXTO" && <span>{MESSAGE_TYPE_LABEL[message.type]}</span>}
          <time dateTime={message.createdAt.toISOString()}>
            {formatBogotaTime(message.createdAt)}
          </time>
          {!fromClient && message.deliveryStatus && (
            <span className={cn(message.deliveryStatus === "failed" && "text-destructive")}>
              · {DELIVERY_LABEL[message.deliveryStatus] ?? message.deliveryStatus}
            </span>
          )}
        </p>

        {fromAgent && message.agentTrace != null && <AgentTrace trace={message.agentTrace} />}
      </div>
    </li>
  );
}

function MessageMedia({ message }: { message: Message }) {
  if (!message.mediaPath) return null;

  if (!message.mediaUrl) {
    return (
      <p className="mb-1 text-xs italic text-muted-foreground">
        {MESSAGE_TYPE_LABEL[message.type]} no disponible en este momento.
      </p>
    );
  }

  const mime = message.mediaMime ?? "";
  if (mime.startsWith("audio/")) {
    return (
      <audio controls preload="none" src={message.mediaUrl} className="mb-1 w-64 max-w-full">
        <a href={message.mediaUrl}>Descargar audio</a>
      </audio>
    );
  }
  if (mime.startsWith("image/")) {
    return (
      <div className="mb-1">
        <ImageViewer src={message.mediaUrl} alt={message.body ?? "Imagen enviada por WhatsApp"} />
      </div>
    );
  }
  return (
    <a
      href={message.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-primary hover:underline"
    >
      <FileText className="size-4" aria-hidden="true" />
      Abrir documento
    </a>
  );
}

/**
 * Trazabilidad del agente: herramientas y fuentes que usó para responder.
 * n8n manda `{ herramientas: [...], fuentes: [...] }`; si llega otra forma,
 * se muestra tal cual.
 */
function AgentTrace({ trace }: { trace: unknown }) {
  const data = (typeof trace === "object" && trace !== null ? trace : {}) as {
    herramientas?: unknown;
    fuentes?: unknown;
  };
  const tools = Array.isArray(data.herramientas) ? data.herramientas.map(String) : null;
  const sources = Array.isArray(data.fuentes) ? data.fuentes.map(describeSource) : null;

  return (
    <details className="mt-1.5 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer items-center gap-1 select-none">
        <Wrench className="size-3" aria-hidden="true" />
        {tools && tools.length > 0 ? `${tools.length} herramienta${tools.length === 1 ? "" : "s"}` : "Traza"}
      </summary>
      <div className="mt-1 space-y-1">
        {tools && tools.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tools.map((tool, index) => (
              <code key={`${tool}-${index}`} className="rounded bg-muted px-1.5 py-0.5">
                {tool}
              </code>
            ))}
          </div>
        )}
        {sources && sources.length > 0 && (
          <ul className="list-disc pl-4">
            {sources.map((source, index) => (
              <li key={index}>{source}</li>
            ))}
          </ul>
        )}
        {!tools && !sources && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
            {JSON.stringify(trace, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}

function describeSource(source: unknown): string {
  if (typeof source === "string") return source;
  if (typeof source === "object" && source !== null) {
    const s = source as { titulo?: unknown; fuente?: unknown; similitud?: unknown };
    const name = String(s.titulo ?? s.fuente ?? "Fuente");
    return typeof s.similitud === "number" ? `${name} (${Math.round(s.similitud * 100)} %)` : name;
  }
  return String(source);
}
