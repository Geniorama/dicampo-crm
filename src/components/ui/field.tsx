import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Estilo compartido por input, select y textarea.
 *
 * No lleva padding vertical: los controles de una sola línea fijan su altura
 * con `h-*` y el navegador centra el texto dentro. Mezclar `py-*` con `h-*`
 * recorta el contenido cuando la altura baja (p. ej. en la variante compacta).
 * El textarea, que sí es multilínea, añade su propio padding.
 */
const controlClasses =
  "w-full rounded-md border border-input bg-card px-3 text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive";

/** Alturas y tamaño de letra por variante. */
const controlSizes = {
  md: "h-9 text-sm",
  sm: "h-8 text-xs",
} as const;

export type ControlSize = keyof typeof controlSizes;

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: ControlSize }
>(({ className, inputSize = "md", ...props }, ref) => (
  <input
    ref={ref}
    className={cn(controlClasses, controlSizes[inputSize], className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(controlClasses, "resize-y py-2 text-sm", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { selectSize?: ControlSize }
>(({ className, selectSize = "md", ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      controlClasses,
      controlSizes[selectSize],
      // Espacio para la flecha nativa, que se dibuja dentro de la caja.
      selectSize === "sm" ? "pr-7" : "pr-8",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({
  className,
  children,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/**
 * Agrupa etiqueta, control y mensaje de error, enlazando `htmlFor`,
 * `aria-describedby` y `aria-invalid` para que el error sea accesible.
 */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  }) => React.ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
