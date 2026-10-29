"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { matchesTerms, normalizeSearch, searchTerms } from "@/lib/text-search";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Texto secundario bajo la etiqueta (razón social, NIT…). */
  detail?: string;
  /** Otros textos por los que también se encuentra la opción. */
  keywords?: (string | null | undefined)[];
};

/** Con miles de clientes, pintar todas las coincidencias no ayuda a elegir. */
const MAX_RESULTS = 50;

/**
 * Selector con búsqueda: se escribe y la lista se filtra desde la primera
 * letra, sin importar mayúsculas ni tildes (`lib/text-search.ts`).
 *
 * Sigue el patrón "combobox" de WAI-ARIA: flechas para moverse, Enter para
 * elegir, Escape para cerrar. Al salir sin elegir, el texto vuelve a la
 * opción seleccionada, para que nunca quede escrito algo que no se guardó.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "Escribe para buscar…",
  emptyText = "Sin coincidencias.",
  disabled,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id: string;
  options: readonly ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const listId = `${id}-opciones`;
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = React.useState(selected?.label ?? "");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  // Si la selección cambia desde fuera (p. ej. al crear un cliente nuevo),
  // el texto la sigue.
  const selectedLabel = selected?.label ?? "";
  React.useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  // Normalizar una vez por lista, no en cada tecla.
  const indexed = React.useMemo(
    () =>
      options.map((option) => ({
        option,
        text: normalizeSearch(
          [option.label, option.detail, ...(option.keywords ?? [])].filter(Boolean).join(" "),
        ),
      })),
    [options],
  );

  // Recién abierto, con la opción elegida escrita, se muestra todo.
  const terms = query === selectedLabel ? [] : searchTerms(query);
  const allMatches = indexed
    .filter((entry) => matchesTerms(entry.text, terms))
    .map((entry) => entry.option);
  const matches = allMatches.slice(0, MAX_RESULTS);

  function choose(option: ComboboxOption) {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function close() {
    setOpen(false);
    // Lo escrito sin elegir no cuenta; borrar todo sí quita la selección.
    if (query.trim() === "") {
      if (value) onChange("");
    } else {
      setQuery(selectedLabel);
    }
  }

  function move(step: number) {
    if (!open) {
      setOpen(true);
      return;
    }
    if (matches.length === 0) return;
    const next = (active + step + matches.length) % matches.length;
    setActive(next);
    listRef.current
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        // Enter elige; no debe enviar el formulario a medio llenar.
        if (open && matches[active]) {
          event.preventDefault();
          choose(matches[active]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        break;
    }
  }

  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(event) => {
          event.target.select();
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive"
      />

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                // mousedown en vez de click: el blur del input cerraría la
                // lista antes de que el click llegara.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm",
                  index === active && "bg-muted",
                  option.value === value && "font-medium text-primary-strong",
                )}
              >
                <span className="block text-foreground">{option.label}</span>
                {option.detail && (
                  <span className="block text-xs text-muted-foreground">{option.detail}</span>
                )}
              </li>
            ))
          )}
          {allMatches.length > MAX_RESULTS && (
            <li className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {allMatches.length - MAX_RESULTS} más: sigue escribiendo para afinar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
