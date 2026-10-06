"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Upload,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { DELIMITER_LABEL } from "@/lib/import/csv";
import type { ImportEntity } from "@/lib/import/entities";
import { missingRequired } from "@/lib/import/mapping";
import {
  IMPORT_MODE_LABEL,
  type ColumnMapping,
  type ImportAnalysis,
  type ImportMode,
  type ImportReport,
} from "@/lib/import/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { ColumnMapper } from "./column-mapper";
import { ImportReportView } from "./import-report";

/**
 * Asistente de carga masiva, en tres pasos: archivo → cotejo → informe.
 *
 * El paso que no se puede saltar es la **simulación**: antes de escribir hay
 * que ver el informe. Cuesta un segundo y evita descubrir con el inventario
 * ya cargado que la columna de vencimiento venía en formato americano.
 */
export function ImportWizard({ entity }: { entity: ImportEntity }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<ImportMode>(entity.modes[0]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState<"analizar" | "simular" | "importar" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const pending = missingRequired(mapping, entity.fields);

  async function guard(step: typeof busy, action: () => Promise<void>) {
    setBusy(step);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "No se pudo completar la operación. Intenta de nuevo.",
      );
    } finally {
      setBusy(null);
    }
  }

  function analyze(selected: File, sheet?: string) {
    return guard("analizar", async () => {
      const form = new FormData();
      form.append("archivo", selected);
      if (sheet) form.append("hoja", sheet);

      const result = await api.upload<ImportAnalysis>(
        `/api/importar/${entity.key}/analizar`,
        form,
      );

      setFile(selected);
      setAnalysis(result);
      setMapping(result.suggestion);
      setReport(null);
      setApplied(false);
    });
  }

  function run(dryRun: boolean) {
    if (!analysis) return;

    return guard(dryRun ? "simular" : "importar", async () => {
      const result = await api.post<ImportReport>(`/api/importar/${entity.key}`, {
        mode,
        dryRun,
        mapping,
        rows: analysis.rows,
      });

      setReport(result);

      if (!dryRun) {
        setApplied(true);
        // El módulo de destino se renderiza en el servidor: sin esto seguiría
        // mostrando la caché anterior a la carga.
        router.refresh();
      }
    });
  }

  function reset() {
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setReport(null);
    setApplied(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>1. El archivo</CardTitle>
          <a
            href={`/api/importar/${entity.key}/plantilla`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Plantilla de ejemplo
          </a>
        </CardHeader>

        <CardContent className="space-y-3">
          <Field
            id="archivo"
            label="Archivo CSV o Excel"
            hint="Formatos: .csv, .txt, .tsv y .xlsx. El .xls antiguo hay que volver a guardarlo como .xlsx."
          >
            {(props) => (
              <Input
                {...props}
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="h-auto py-1.5"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void analyze(selected);
                }}
              />
            )}
          </Field>

          {busy === "analizar" && (
            <p className="text-xs text-muted-foreground">Leyendo el archivo…</p>
          )}

          {analysis && file && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              <span className="font-medium text-foreground">{file.name}</span>
              <span>·</span>
              <span>
                {analysis.rows.length.toLocaleString("es-CO")}{" "}
                {analysis.rows.length === 1 ? "fila" : "filas"} ·{" "}
                {analysis.headers.length}{" "}
                {analysis.headers.length === 1 ? "columna" : "columnas"}
              </span>
              {analysis.delimiter && (
                <>
                  <span>·</span>
                  <span>
                    separador:{" "}
                    {DELIMITER_LABEL[analysis.delimiter] ?? analysis.delimiter}
                  </span>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={reset}>
                <RefreshCw aria-hidden="true" />
                Cambiar archivo
              </Button>
            </div>
          )}

          {analysis && analysis.sheets && analysis.sheets.length > 1 && file && (
            <Field id="hoja" label="Hoja del libro">
              {(props) => (
                <Select
                  {...props}
                  value={analysis.sheetName ?? ""}
                  onChange={(event) => void analyze(file, event.target.value)}
                >
                  {analysis.sheets?.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}

          {analysis && analysis.truncated > 0 && (
            <p className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
              El archivo trae {analysis.truncated.toLocaleString("es-CO")} filas
              de más, que no se cargarán. Divídelo y sube el resto en una
              segunda pasada.
            </p>
          )}
        </CardContent>
      </Card>

      {analysis && !applied && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Cotejo de columnas</CardTitle>
              <Badge tone={pending.length > 0 ? "warning" : "success"}>
                {pending.length > 0
                  ? `Faltan ${pending.length} obligatorios`
                  : "Listo para simular"}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-4">
              <Field
                id="modo"
                label="Qué hacer con lo que ya existe"
                hint={`Se reconoce por: ${entity.identity.toLowerCase()}`}
              >
                {(props) => (
                  <Select
                    {...props}
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as ImportMode)
                    }
                  >
                    {entity.modes.map((option) => (
                      <option key={option} value={option}>
                        {IMPORT_MODE_LABEL[option]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <ColumnMapper
                entity={entity}
                headers={analysis.headers}
                rows={analysis.rows}
                mapping={mapping}
                onChange={setMapping}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {pending.length > 0
                ? `Sin cotejar: ${pending.map((field) => field.label).join(", ")}.`
                : "La simulación recorre todas las filas sin escribir nada."}
            </p>
            <Button
              size="lg"
              disabled={pending.length > 0 || busy !== null}
              onClick={() => void run(true)}
            >
              <Upload aria-hidden="true" />
              {busy === "simular" ? "Simulando…" : "Simular la carga"}
            </Button>
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>3. {applied ? "Resultado" : "Vista previa"}</CardTitle>
            {applied && (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Importado
              </Badge>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            <ImportReportView report={report} />

            {!applied && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-px size-4 shrink-0" aria-hidden="true" />
                  <span>
                    {report.counts.error > 0
                      ? `Al confirmar se aplicarán las filas correctas; las ${report.counts.error} con error se omiten.`
                      : "Al confirmar se escribirán los cambios listados arriba."}
                  </span>
                </p>
                <Button
                  size="lg"
                  disabled={
                    busy !== null ||
                    report.counts.crear + report.counts.actualizar === 0
                  }
                  onClick={() => void run(false)}
                >
                  {busy === "importar" ? "Importando…" : "Confirmar e importar"}
                </Button>
              </div>
            )}

            {applied && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Link
                  href={entity.moduleHref}
                  className={buttonVariants({ variant: "primary" })}
                >
                  Ir a {entity.moduleLabel}
                </Link>
                <Button variant="secondary" onClick={reset}>
                  Importar otro archivo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
