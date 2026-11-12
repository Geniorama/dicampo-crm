import { prisma } from "../db";
import { computeSalesStats } from "@/lib/client-sales";
import { SOLD_STATUSES } from "./analytics";

/**
 * Recalcula los datos variables de venta del cliente (último pedido, número
 * de pedidos, ticket promedio) a partir del corte de la base maestra más sus
 * pedidos del CRM. Se llama cada vez que un pedido se crea, se confirma o se
 * cancela: es idempotente, así que repetirlo no cambia el resultado.
 */
export async function refreshClientSalesStats(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { baseOrderCount: true, baseSalesTotal: true, baseLastOrderAt: true },
  });
  if (!client) return null;

  const orders = await prisma.order.findMany({
    where: { clientId, status: { in: SOLD_STATUSES } },
    select: { orderDate: true, total: true },
  });

  const stats = computeSalesStats(
    {
      count: client.baseOrderCount,
      total: Number(client.baseSalesTotal),
      lastOrderAt: client.baseLastOrderAt,
    },
    orders.map((order) => ({ orderDate: order.orderDate, total: Number(order.total) })),
  );

  await prisma.client.update({
    where: { id: clientId },
    data: {
      orderCount: stats.orderCount,
      avgTicket: stats.avgTicket,
      lastOrderAt: stats.lastOrderAt,
    },
  });

  return stats;
}
