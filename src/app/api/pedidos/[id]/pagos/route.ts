import type { NextRequest } from "next/server";
import { DISPATCH_ROLES, requireUser, SALES_ROLES } from "@/server/guards";
import { created, ok, readJson, route } from "@/server/http";
import { getOrderPayments, registerPayment } from "@/server/services/receivables";
import { paymentCreateSchema } from "@/server/validators/payments";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Quien cobra: ventas, y el repartidor que recibe el pago al entregar. */
const COLLECTOR_ROLES = [...SALES_ROLES, ...DISPATCH_ROLES];

/** GET /api/pedidos/:id/pagos — abonos del pedido y su saldo. */
export const GET = route(async (_request: NextRequest, context: Context) => {
  const user = await requireUser(COLLECTOR_ROLES);
  const { id } = await context.params;

  return ok(await getOrderPayments(user, id));
});

/** POST /api/pedidos/:id/pagos — registra un abono; no admite pagar de más. */
export const POST = route(async (request: NextRequest, context: Context) => {
  const user = await requireUser(COLLECTOR_ROLES);
  const { id } = await context.params;
  const input = paymentCreateSchema.parse(await readJson(request));

  return created(await registerPayment(user, id, input));
});
