import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { GoalPace, GoalProgress } from "@/lib/goals";

const PACE_LABEL: Record<GoalPace, string> = {
  ADELANTADO: "Adelantado",
  EN_RITMO: "En ritmo",
  ATRASADO: "Atrasado",
  CUMPLIDA: "Cumplida",
  SIN_META: "Sin meta",
};

const PACE_TONE: Record<GoalPace, BadgeTone> = {
  ADELANTADO: "success",
  EN_RITMO: "info",
  ATRASADO: "warning",
  CUMPLIDA: "success",
  SIN_META: "neutral",
};

/**
 * Barra de avance de una meta. La marca vertical señala dónde debería ir hoy
 * si el ritmo fuera parejo, para leer de un vistazo si se va adelantado o
 * atrasado sin hacer cuentas.
 */
export function GoalMeter({
  label,
  progress,
  format,
}: {
  label: string;
  progress: GoalProgress;
  format: (value: number) => string;
}) {
  const percent = progress.percent === null ? 0 : Math.min(progress.percent, 100);
  const expectedPercent =
    progress.target > 0 ? Math.min((progress.expected / progress.target) * 100, 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge tone={PACE_TONE[progress.pace]}>{PACE_LABEL[progress.pace]}</Badge>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={
            progress.pace === "ATRASADO" ? "h-full bg-warning" : "h-full bg-primary"
          }
          style={{ width: `${percent}%` }}
        />
        {progress.target > 0 && progress.pace !== "CUMPLIDA" && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-foreground/50"
            style={{ left: `${expectedPercent}%` }}
          />
        )}
      </div>

      <p className="tabular text-xs text-muted-foreground">
        {format(progress.achieved)}
        {progress.target > 0 && (
          <>
            {" "}
            de {format(progress.target)} · {Math.round(progress.percent ?? 0)}%
            {progress.pace !== "CUMPLIDA" && ` · a hoy debería llevar ${format(progress.expected)}`}
          </>
        )}
      </p>
    </div>
  );
}
