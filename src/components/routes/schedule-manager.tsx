"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power, PowerOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type ScheduleRow = {
  id: string;
  name: string;
  /** Día de la semana en palabras ("sábado"). */
  weekday: string;
  zone: string | null;
  driver: string | null;
  vehicle: string | null;
  active: boolean;
};

/** Rutas recurrentes: pausar y reanudar. No se borran; las rutas ya generadas las referencian. */
export function ScheduleManager({ schedules }: { schedules: ScheduleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(schedule: ScheduleRow) {
    setError(null);
    setBusyId(schedule.id);
    try {
      await api.patch(`/api/rutas/programadas/${schedule.id}`, { active: !schedule.active });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
    }
  }

  if (schedules.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No hay rutas recurrentes"
          description="Al crear una ruta, marca «Repetir cada semana» para programarla."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Card>
        <ul className="divide-y divide-border">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">
                  {schedule.name}{" "}
                  <Badge tone={schedule.active ? "success" : "neutral"}>
                    {schedule.active ? "Activa" : "Pausada"}
                  </Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  Todos los {schedule.weekday}
                  {schedule.weekday.endsWith("s") ? "" : "s"} · {schedule.zone ?? "Sin zona"} ·{" "}
                  {schedule.driver ?? "Sin repartidor"}
                  {schedule.vehicle ? ` · ${schedule.vehicle}` : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={busyId === schedule.id}
                onClick={() => toggle(schedule)}
              >
                {schedule.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                {schedule.active ? "Pausar" : "Reanudar"}
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
