"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";

export type SheetOption = {
  key: string;
  label: string;
  description: string;
  /** Cuántas filas trae con el período actual. */
  rows: number;
  /** Se oculta si el rol no tiene acceso a esos datos. */
  allowed: boolean;
};

export type PeriodOption = { value: string; label: string };

/**
 * Herramienta de exportación a Excel.
 *
 * La descarga se hace navegando a la URL, no con `fetch`: el navegador tiene
 * que recibir el archivo con su `Content-Disposition` para guardarlo. Bajarlo
 * a memoria y crear un blob solo añadiría un paso y rompería en archivos
 * grandes.
 */
export function ExportTool({
  periods,
  defaultPeriod,
  defaultFrom,
  defaultTo,
  defaultInactiveDays,
  sheets,
}: {
  periods: PeriodOption[];
  defaultPeriod: string;
  defaultFrom: string;
  defaultTo: string;
  defaultInactiveDays: number;
  sheets: SheetOption[];
}) {
  const available = useMemo(() => sheets.filter((s) => s.allowed), [sheets]);

  const [period, setPeriod] = useState(defaultPeriod);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [inactiveDays, setInactiveDays] = useState(String(defaultInactiveDays));
  const [selected, setSelected] = useState<string[]>(
    available.map((sheet) => sheet.key),
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const isCustom = period === "PERSONALIZADO";
  const totalRows = available
    .filter((sheet) => selected.includes(sheet.key))
    .reduce((acc, sheet) => acc + sheet.rows, 0);

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  function download() {
    const search = new URLSearchParams();
    search.set("period", period);
    if (isCustom) {
      search.set("from", from);
      search.set("to", to);
    }
    search.set("inactiveDays", inactiveDays);
    for (const key of selected) search.append("hojas", key);

    setIsDownloading(true);
    // El navegador abre la descarga; la pestaña actual no cambia.
    window.location.href = `/api/reportes/excel?${search.toString()}`;

    // No hay evento que avise cuando termina una descarga iniciada así:
    // se restablece el botón tras un momento para no dejarlo bloqueado.
    setTimeout(() => setIsDownloading(false), 3000);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Período</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="exp-period" label="Período">
            {(props) => (
              <Select
                {...props}
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                {periods.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            id="exp-from"
            label="Desde"
            hint={isCustom ? undefined : "Solo con período personalizado"}
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={from}
                disabled={!isCustom}
                onChange={(event) => setFrom(event.target.value)}
              />
            )}
          </Field>

          <Field
            id="exp-to"
            label="Hasta"
            hint={isCustom ? undefined : "Solo con período personalizado"}
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                value={to}
                disabled={!isCustom}
                onChange={(event) => setTo(event.target.value)}
              />
            )}
          </Field>

          <Field id="exp-inactive" label="Alerta de recompra">
            {(props) => (
              <Select
                {...props}
                value={inactiveDays}
                onChange={(event) => setInactiveDays(event.target.value)}
              >
                <option value="15">15 días sin comprar</option>
                <option value="30">30 días sin comprar</option>
                <option value="60">60 días sin comprar</option>
                <option value="90">90 días sin comprar</option>
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hojas del libro</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(available.map((sheet) => sheet.key))}
            >
              Todas
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Ninguna
            </Button>
          </div>
        </CardHeader>

        <ul className="divide-y divide-border">
          {available.map((sheet) => {
            const checked = selected.includes(sheet.key);

            return (
              <li key={sheet.key}>
                <label className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(sheet.key)}
                    className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {sheet.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {sheet.description}
                    </span>
                  </span>
                  <span
                    className={`tabular shrink-0 text-xs ${
                      sheet.rows === 0
                        ? "text-muted-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {sheet.rows === 0
                      ? "sin datos"
                      : `${sheet.rows.toLocaleString("es-CO")} ${sheet.rows === 1 ? "fila" : "filas"}`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selected.length === 0
            ? "Selecciona al menos una hoja."
            : `${selected.length} ${selected.length === 1 ? "hoja" : "hojas"} · ${totalRows.toLocaleString("es-CO")} filas en total. El libro siempre incluye una portada con el resumen.`}
        </p>
        <Button
          size="lg"
          disabled={selected.length === 0 || isDownloading}
          onClick={download}
        >
          <FileSpreadsheet aria-hidden="true" />
          {isDownloading ? "Generando…" : "Descargar Excel"}
        </Button>
      </div>
    </div>
  );
}
