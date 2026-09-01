import type { Metadata } from "next";
import { requireUserPage, SALES_ROLES, scopeToOwnPortfolio } from "@/server/guards";
import { prisma } from "@/server/db";
import { listSellableVariants } from "@/server/services/catalog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import {
  OrderForm,
  type ClientOption,
  type VariantOption,
} from "@/components/orders/order-form";

export const metadata: Metadata = { title: "Nuevo pedido" };

export default async function NewOrderPage() {
  const user = await requireUserPage(SALES_ROLES);

  const [clients, variants] = await Promise.all([
    prisma.client.findMany({
      where: {
        ...scopeToOwnPortfolio(user),
        // A un cliente suspendido no se le toman pedidos.
        status: { in: ["ACTIVO", "PROSPECTO"] },
      },
      orderBy: { businessName: "asc" },
      select: {
        id: true,
        businessName: true,
        tradeName: true,
        addresses: {
          where: { active: true },
          orderBy: { isPrimary: "desc" },
          select: { id: true, label: true, address: true },
        },
      },
    }),
    listSellableVariants(),
  ]);

  const clientOptions: ClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.tradeName ?? client.businessName,
    addresses: client.addresses,
  }));

  const variantOptions: VariantOption[] = variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    presentation: variant.presentation,
    productName: variant.product.name,
    taxRate: Number(variant.product.taxRate),
    // Escalón base de la lista por defecto; el servidor resuelve el precio
    // definitivo con la lista propia del cliente.
    price: variant.priceItems?.[0] ? Number(variant.priceItems[0].price) : null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Nuevo pedido"
        description="Los precios mostrados son de la lista general; el servidor aplica la del cliente al guardar."
      />

      {clientOptions.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay clientes disponibles"
            description="Registra primero un cliente para poder tomarle un pedido."
          />
        </Card>
      ) : variantOptions.length === 0 ? (
        <Card>
          <EmptyState
            title="El catálogo está vacío"
            description="Ejecuta `npm run db:seed` para cargar los sabores y sus precios."
          />
        </Card>
      ) : (
        <OrderForm clients={clientOptions} variants={variantOptions} />
      )}
    </div>
  );
}
