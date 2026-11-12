-- Modulo "Mis clientes": estado comercial, dias de pedido y entrega, y datos
-- variables de venta (ultimo pedido, ticket promedio) guardados en el cliente.
CREATE TYPE "ClientRelationStatus" AS ENUM ('ACTIVO', 'POR_RECUPERAR', 'EN_ALERTA');

ALTER TABLE "Client"
  ADD COLUMN "relationStatus" "ClientRelationStatus",
  ADD COLUMN "orderDay" TEXT,
  ADD COLUMN "deliveryDay" TEXT,
  ADD COLUMN "baseOrderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "baseSalesTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "baseLastOrderAt" TIMESTAMP(3),
  ADD COLUMN "orderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "avgTicket" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lastOrderAt" TIMESTAMP(3);

CREATE INDEX "Client_ownerId_lastOrderAt_idx" ON "Client"("ownerId", "lastOrderAt");

-- Los clientes que ya tienen pedidos en el CRM arrancan con sus cifras al dia.
UPDATE "Client" c SET
  "orderCount" = s.n,
  "avgTicket" = ROUND(s.total / s.n, 2),
  "lastOrderAt" = s.last
FROM (
  SELECT "clientId", COUNT(*) AS n, SUM("total") AS total, MAX("orderDate") AS last
  FROM "Order"
  WHERE "status" IN ('CONFIRMADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO')
  GROUP BY "clientId"
) s
WHERE s."clientId" = c.id;
