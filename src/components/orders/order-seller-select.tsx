"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Select } from "@/components/ui/field";

/**
 * Corrige a qué asesor se atribuye un pedido. Solo lo ve un ADMIN: mover una
 * venta cambia las metas de dos personas.
 */
export function OrderSellerSelect({
  orderId,
  sellerId,
  sellerName,
  sellers,
}: {
  orderId: string;
  sellerId: string | null;
  sellerName: string | null;
  sellers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(sellerId ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    setIsPending(true);
    try {
      await api.patch(`/api/pedidos/${orderId}/vendedor`, { sellerId: next });
      router.refresh();
    } catch (caught) {
      setValue(previous);
      setError(
        caught instanceof ApiClientError ? caught.message : "No se pudo cambiar el vendedor.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Select
        aria-label="Vendedor"
        selectSize="sm"
        value={value}
        disabled={isPending}
        onChange={(event) => change(event.target.value)}
      >
        {!value && <option value="">Sin vendedor</option>}
        {/* Quien ya no está activo no se ofrece, pero se sigue mostrando. */}
        {sellerId && !sellers.some((seller) => seller.id === sellerId) && (
          <option value={sellerId} disabled>
            {sellerName ?? "Usuario"} (inactivo)
          </option>
        )}
        {sellers.map((seller) => (
          <option key={seller.id} value={seller.id}>
            {seller.name}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
