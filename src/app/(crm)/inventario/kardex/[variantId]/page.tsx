import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/guards";
import { prisma } from "@/server/db";
import { getKardex } from "@/server/services/inventory";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateTime, formatOrderNumber, formatQuantity } from "@/lib/format";
import { PRESENTATION_LABEL, STOCK_MOVEMENT_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "Kardex" };

export default async function KardexPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  await requireUser();
  const { variantId } = await params;

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      presentation: true,
      product: { select: { id: true, name: true } },
    },
  });
  if (!variant) notFound();

  const movements = await getKardex(variantId, 200);

  /*
   * Saldo corriente. El kardex llega del más reciente al más antiguo, así que
   * se recorre al revés acumulando, y luego se vuelve a invertir para mostrar
   * lo último arriba con su saldo correcto en cada línea.
   */
  let running = 0;
  const withBalance = [...movements]
    .reverse()
    .map((movement) => {
      running += Number(movement.quantity);
      return { ...movement, balance: running };
    })
    .reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Kardex · ${variant.product.name}`}
        description={`${PRESENTATION_LABEL[variant.presentation]} · ${variant.sku}`}
        actions={
          <Link
            href="/inventario"
            className={buttonVariants({ variant: "secondary" })}
          >
            <ArrowLeft aria-hidden="true" />
            Volver
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <p className="text-xs text-muted-foreground">
            Registro de solo inserción: nunca se edita ni se borra
          </p>
        </CardHeader>

        {withBalance.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Registra una entrada de producción para empezar."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-5 py-2 font-medium">Movimiento</th>
                  <th scope="col" className="px-5 py-2 font-medium">Lote</th>
                  <th scope="col" className="px-5 py-2 font-medium">Referencia</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Cantidad</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map((movement) => {
                  const quantity = Number(movement.quantity);

                  return (
                    <tr
                      key={movement.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {formatDateTime(movement.createdAt)}
                      </td>

                      <td className="px-5 py-2.5">
                        <Badge tone={quantity >= 0 ? "success" : "warning"}>
                          {STOCK_MOVEMENT_LABEL[movement.type]}
                        </Badge>
                        {movement.reason && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {movement.reason}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-2.5 text-muted-foreground">
                        {movement.lot ? (
                          <>
                            {movement.lot.lotCode}
                            <span className="block text-xs">
                              vence {formatDate(movement.lot.expiryDate)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="px-5 py-2.5 text-muted-foreground">
                        {movement.order ? (
                          <Link
                            href={`/pedidos/${movement.order.id}`}
                            className="tabular text-primary hover:underline"
                          >
                            {formatOrderNumber(movement.order.orderNumber)}
                          </Link>
                        ) : (
                          (movement.user?.name ?? "—")
                        )}
                      </td>

                      <td
                        className={`tabular px-5 py-2.5 text-right font-medium ${
                          quantity < 0 ? "text-destructive" : "text-success"
                        }`}
                      >
                        {quantity > 0 ? "+" : ""}
                        {formatQuantity(quantity)}
                      </td>

                      <td className="tabular px-5 py-2.5 text-right text-foreground">
                        {formatQuantity(movement.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
