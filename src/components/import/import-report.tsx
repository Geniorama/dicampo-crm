"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ROW_ACTION_LABEL, type ImportReport, type RowAction } from "@/lib/import/types";

/**
 * Informe fila por fila.
 *
 * Es el corazón de la herramienta: una carga masiva sin informe es un salto
 * al vacío. Se muestra igual en la simulación y después de importar, con la
 * misma forma, para que confirmar no sea una sorpresa.
 */

const TONE: Record<RowAction, BadgeTone> = {
  crear: "success",
  actualizar: "info",
  omitir: "neutral",
  error: "danger",
};

/** Con miles de filas, pintarlas todas cuelga el navegador sin aportar nada. */
const VISIBLE_ROWS = 300;

export function ImportReportView({ report }: { report: ImportReport }) {
  const [onlyErrors, setOnlyErrors] = useState(report.counts.error > 0);

  const rows = onlyErrors
    ? report.rows.filter((row) => row.action === "error")
    : report.rows;
  const visible = rows.slice(0, VISIBLE_ROWS);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(TONE) as RowAction[]).map((action) => (
          <Card key={action} className="px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {ROW_ACTION_LABEL[action]}
            </p>
            <p
              className={`tabular mt-1 text-xl font-semibold ${
                action === "error" && report.counts.error > 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              {report.counts[action].toLocaleString("es-CO")}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {report.total.toLocaleString("es-CO")}{" "}
            {report.total === 1 ? "fila leída" : "filas leídas"}
            {report.dryRun
              ? " · simulación: no se ha escrito nada"
              : " · cambios aplicados"}
          </p>

          {report.counts.error > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOnlyErrors((value) => !value)}
            >
              {onlyErrors ? "Ver todas las filas" : "Ver solo los errores"}
            </Button>
          )}
        </div>

        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-2 font-medium">
                  Fila
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Resultado
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Registro
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Detalle
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.line}
                  className="border-b border-border last:border-0"
                >
                  <td className="tabular px-4 py-2 text-muted-foreground">
                    {row.line}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={TONE[row.action]}>
                      {ROW_ACTION_LABEL[row.action]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-foreground">{row.label}</td>
                  <td
                    className={`px-4 py-2 ${
                      row.action === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {row.message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > visible.length && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Se muestran las primeras {VISIBLE_ROWS} de{" "}
            {rows.length.toLocaleString("es-CO")} filas.
          </p>
        )}
      </Card>
    </div>
  );
}
