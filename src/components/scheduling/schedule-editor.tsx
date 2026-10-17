"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { WEEKDAY_LABEL } from "@/lib/labels";
import { VISIT_HOURS_LABEL, minutesToTime } from "@/lib/visit-schedule";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { apiErrorMessage } from "./error-message";

type Settings = {
  acceptsVisits: boolean;
  visitMinutes: number;
  bufferMinutes: number;
  minLeadDays: number;
  maxDaysAhead: number;
};

type WindowRow = { key: number; weekday: number; start: string; end: string };

/** Días ISO, de lunes (1) a domingo (7). */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

let nextKey = 0;
const row = (weekday: number, start: string, end: string): WindowRow => ({
  key: nextKey++,
  weekday,
  start,
  end,
});

/** Franjas que se proponen al pulsar "Añadir franja" en un día vacío. */
const DEFAULT_START = "09:00";
const DEFAULT_END = "12:00";

/**
 * Editor de la disponibilidad semanal de un asesor: interruptor, duración de
 * la visita, traslado, anticipación y las franjas de cada día. Se guarda todo
 * de una vez; las reglas (franjas que se cruzan, horas imposibles) las valida
 * el servidor con el mismo esquema.
 */
export function ScheduleEditor({
  advisorId,
  settings: initialSettings,
  windows: initialWindows,
}: {
  advisorId: string;
  settings: Settings;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [windows, setWindows] = useState<WindowRow[]>(() =>
    initialWindows.map((window) =>
      row(window.weekday, minutesToTime(window.startMinute), minutesToTime(window.endMinute)),
    ),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setNumber(name: keyof Omit<Settings, "acceptsVisits">, value: string) {
    setSaved(false);
    setSettings((current) => ({ ...current, [name]: Number(value) }));
  }

  function updateWindow(key: number, patch: Partial<WindowRow>) {
    setSaved(false);
    setWindows((current) =>
      current.map((window) => (window.key === key ? { ...window, ...patch } : window)),
    );
  }

  function addWindow(weekday: number) {
    setSaved(false);
    const sameDay = windows.filter((window) => window.weekday === weekday);
    // La segunda franja del día arranca donde acabó la anterior, más una hora
    // de almuerzo: es lo que casi siempre se quiere.
    const last = sameDay.at(-1);
    const start = last ? addHour(last.end) : DEFAULT_START;
    const end = last ? addHour(start, 4) : DEFAULT_END;
    setWindows((current) => [...current, row(weekday, start, end)]);
  }

  function removeWindow(key: number) {
    setSaved(false);
    setWindows((current) => current.filter((window) => window.key !== key));
  }

  /** Copia las franjas del lunes al resto de días hábiles. */
  function copyMondayToWeekdays() {
    setSaved(false);
    const monday = windows.filter((window) => window.weekday === 1);
    setWindows((current) => [
      ...current.filter((window) => window.weekday === 1 || window.weekday > 5),
      ...[2, 3, 4, 5].flatMap((weekday) =>
        monday.map((window) => row(weekday, window.start, window.end)),
      ),
    ]);
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      await api.put(`/api/agenda/asesores/${advisorId}`, {
        ...settings,
        windows: windows.map(({ weekday, start, end }) => ({ weekday, start, end })),
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, "No se pudo guardar la disponibilidad."));
    } finally {
      setIsSaving(false);
    }
  }

  const hasMonday = windows.some((window) => window.weekday === 1);

  return (
    <div className="space-y-6 px-5 py-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--primary)]"
          checked={settings.acceptsVisits}
          onChange={(event) => {
            setSaved(false);
            setSettings((current) => ({ ...current, acceptsVisits: event.target.checked }));
          }}
        />
        <span>
          <span className="block text-sm font-medium text-foreground">
            Recibe visitas por la agenda
          </span>
          <span className="block text-xs text-muted-foreground">
            Apagado, el agente de WhatsApp deja de ofrecer sus horarios. Las
            franjas se conservan.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="visitMinutes" label="Duración de la visita" hint="Minutos">
          {(props) => (
            <Input
              {...props}
              type="number"
              min={15}
              max={240}
              step={15}
              value={settings.visitMinutes}
              onChange={(event) => setNumber("visitMinutes", event.target.value)}
            />
          )}
        </Field>
        <Field id="bufferMinutes" label="Traslado entre visitas" hint="Minutos libres antes y después">
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              max={240}
              step={5}
              value={settings.bufferMinutes}
              onChange={(event) => setNumber("bufferMinutes", event.target.value)}
            />
          )}
        </Field>
        <Field id="minLeadDays" label="Anticipación mínima" hint="Días: 0 = desde hoy, 1 = desde mañana">
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              max={14}
              value={settings.minLeadDays}
              onChange={(event) => setNumber("minLeadDays", event.target.value)}
            />
          )}
        </Field>
        <Field id="maxDaysAhead" label="Agendar hasta" hint="Días hacia adelante">
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={90}
              value={settings.maxDaysAhead}
              onChange={(event) => setNumber("maxDaysAhead", event.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Franjas semanales</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyMondayToWeekdays}
            disabled={!hasMonday}
            title={hasMonday ? undefined : "Primero define el lunes"}
          >
            <Copy aria-hidden="true" />
            Copiar lunes a martes–viernes
          </Button>
        </div>

        <ul className="divide-y divide-border rounded-md border border-border">
          {WEEKDAYS.map((weekday) => {
            const dayWindows = windows.filter((window) => window.weekday === weekday);
            return (
              <li
                key={weekday}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start"
              >
                <span className="w-28 shrink-0 pt-1.5 text-sm font-medium text-foreground">
                  {WEEKDAY_LABEL[weekday]}
                </span>

                <div className="flex-1 space-y-2">
                  {dayWindows.length === 0 && (
                    <p className="pt-1.5 text-sm text-muted-foreground">Sin visitas</p>
                  )}
                  {dayWindows.map((window) => (
                    <div key={window.key} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${WEEKDAY_LABEL[weekday]}: desde`}
                        value={window.start}
                        onChange={(event) => updateWindow(window.key, { start: event.target.value })}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${WEEKDAY_LABEL[weekday]}: hasta`}
                        value={window.end}
                        onChange={(event) => updateWindow(window.key, { end: event.target.value })}
                        className="w-32"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Quitar franja"
                        onClick={() => removeWindow(window.key)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addWindow(weekday)}
                  className="self-start"
                >
                  <Plus aria-hidden="true" />
                  Añadir franja
                </Button>
              </li>
            );
          })}
        </ul>

        {windows.length === 0 && (
          <p role="status" className="rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning">
            Sin franjas se aplica el horario general de visitas ({VISIT_HOURS_LABEL}).
            Para no recibir visitas, apaga el interruptor de arriba.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <p role="status" className="text-sm text-success">
            Disponibilidad guardada.
          </p>
        )}
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Guardando…" : "Guardar disponibilidad"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "12:00" + 1 h → "13:00". Se detiene en 23:45 porque `<input type="time">`
 * no sabe mostrar "24:00".
 */
function addHour(time: string, hours = 1): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + hours * 60, 23 * 60 + 45);
  return minutesToTime(total);
}
