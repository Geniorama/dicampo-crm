"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { groupFields, type ImportEntity } from "@/lib/import/entities";
import {
  COLUMN_PREFIX,
  CONSTANT_PREFIX,
  type ColumnMapping,
} from "@/lib/import/types";
import { Select } from "@/components/ui/field";
import { unmappedColumns } from "@/lib/import/mapping";

/**
 * Pantalla de cotejo: de qué columna sale cada campo.
 *
 * Es lo que libera de la plantilla. Se propone un cotejo leyendo los
 * encabezados y aquí se corrige lo que haga falta, con un ejemplo real del
 * archivo debajo de cada elección para no tener que ir y volver al Excel.
 *
 * Los campos de lista cerrada admiten además un **valor fijo**: es corriente
 * que la hoja no traiga la columna "Estado" y quien importa sepa que todos
 * entran como prospectos.
 */
export function ColumnMapper({
  entity,
  headers,
  rows,
  mapping,
  onChange,
}: {
  entity: ImportEntity;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}) {
  // Primer valor con contenido de cada columna, como muestra.
  const samples = useMemo(
    () =>
      headers.map(
        (_, index) => rows.find((row) => row[index] !== "")?.[index] ?? "",
      ),
    [headers, rows],
  );

  const groups = useMemo(() => groupFields(entity.fields), [entity.fields]);
  const unused = unmappedColumns(headers, mapping);

  function set(fieldKey: string, source: string) {
    onChange({ ...mapping, [fieldKey]: source });
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.group}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.group}
          </h3>

          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {group.fields.map((field) => {
              const source = mapping[field.key] ?? "";
              const id = `map-${field.key}`;
              const column = source.startsWith(COLUMN_PREFIX)
                ? Number(source.slice(COLUMN_PREFIX.length))
                : null;
              const missing = field.required && !source;

              return (
                <div
                  key={field.key}
                  className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor={id}
                      className="text-sm font-medium text-foreground"
                    >
                      {field.label}
                      {field.required && (
                        <span className="ml-0.5 text-destructive" aria-hidden="true">
                          *
                        </span>
                      )}
                    </label>
                    {field.hint && (
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <Select
                      id={id}
                      value={source}
                      aria-invalid={Boolean(missing)}
                      onChange={(event) => set(field.key, event.target.value)}
                    >
                      <option value="">— Sin asignar —</option>
                      <optgroup label="Columnas del archivo">
                        {headers.map((header, index) => (
                          <option key={index} value={`${COLUMN_PREFIX}${index}`}>
                            {header}
                          </option>
                        ))}
                      </optgroup>
                      {field.options && field.options.length > 0 && (
                        <optgroup label="Mismo valor para todas las filas">
                          {field.options.map((option) => (
                            <option
                              key={option.value}
                              value={`${CONSTANT_PREFIX}${option.value}`}
                            >
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>

                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {missing ? (
                        <span className="text-destructive">
                          Obligatorio: elige una columna o un valor fijo.
                        </span>
                      ) : column !== null ? (
                        samples[column] ? (
                          <>Ejemplo del archivo: {samples[column]}</>
                        ) : (
                          "La columna viene vacía en las primeras filas."
                        )
                      ) : source.startsWith(CONSTANT_PREFIX) ? (
                        "Se aplicará a todas las filas."
                      ) : (
                        "Se dejará vacío."
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {unused.length > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-px size-4 shrink-0" aria-hidden="true" />
          <span>
            {unused.length === 1
              ? "Esta columna del archivo no se usará: "
              : `Estas ${unused.length} columnas del archivo no se usarán: `}
            {unused.join(", ")}.
          </span>
        </p>
      )}
    </div>
  );
}
