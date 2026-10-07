"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Power, PowerOff } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { USER_ROLE_LABEL, toOptions } from "@/lib/labels";
import { AGENT_ROLE, isAssignableRole } from "@/lib/agent";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { UserRole } from "@/generated/prisma/enums";

// El rol del agente IA no se le da a personas.
const roleOptions = toOptions(USER_ROLE_LABEL).filter((option) =>
  isAssignableRole(option.value),
);

/**
 * Acciones sobre un usuario: cambiar rol, activar/desactivar y restablecer
 * contraseña.
 *
 * Las reglas de seguridad (no desactivarse a uno mismo, no quedarse sin
 * administradores) las impone el servidor. Aquí solo se ocultan los controles
 * sobre la propia cuenta para no ofrecer acciones que van a fallar.
 */
export function UserRowActions({
  userId,
  role,
  active,
  isSelf,
}: {
  userId: string;
  role: UserRole;
  active: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // El agente IA no cambia de rol ni usa contraseña: solo se activa o
  // desactiva, que es como se enciende o apaga la integración.
  const isAgent = role === AGENT_ROLE;

  async function run(fn: () => Promise<unknown>, successMessage?: string) {
    setError(null);
    setDone(null);
    setIsPending(true);
    try {
      await fn();
      if (successMessage) setDone(successMessage);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isAgent && (
        <Select
          aria-label="Rol"
          selectSize="sm"
          value={role}
          // Cambiar el propio rol siempre falla en el servidor: no se ofrece.
          disabled={isSelf || isPending || !active}
          className="w-36"
          onChange={(event) =>
            run(() =>
              api.patch(`/api/usuarios/${userId}`, {
                role: event.target.value as UserRole,
              }),
            )
          }
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        )}

        {!isAgent && (
        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setResetting((value) => !value);
            setNewPassword("");
            setDone(null);
          }}
        >
          <KeyRound aria-hidden="true" />
          Clave
        </Button>
        )}

        <Button
          variant={active ? "secondary" : "primary"}
          size="sm"
          // Desactivarse a uno mismo dejaría a la persona fuera del sistema.
          disabled={isSelf || isPending}
          title={isSelf ? "No puedes desactivar tu propia cuenta" : undefined}
          onClick={() =>
            run(() => api.patch(`/api/usuarios/${userId}`, { active: !active }))
          }
        >
          {active ? (
            <>
              <PowerOff aria-hidden="true" />
              Desactivar
            </>
          ) : (
            <>
              <Power aria-hidden="true" />
              Activar
            </>
          )}
        </Button>
      </div>

      {resetting && (
        <div className="flex items-center justify-end gap-2">
          <Input
            aria-label="Nueva contraseña"
            inputSize="sm"
            type="password"
            autoComplete="new-password"
            className="w-52"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Nueva contraseña (mín. 8)"
          />
          <Button
            size="sm"
            disabled={newPassword.length < 8 || isPending}
            onClick={() =>
              run(async () => {
                await api.post(`/api/usuarios/${userId}/clave`, {
                  password: newPassword,
                });
                setNewPassword("");
                setResetting(false);
              }, "Contraseña restablecida.")
            }
          >
            Guardar
          </Button>
        </div>
      )}

      {done && (
        <p role="status" className="text-right text-xs text-success">
          {done}
        </p>
      )}
      {error && (
        <p role="alert" className="text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
