-- CreateEnum
CREATE TYPE "DeliveryFailReason" AS ENUM ('CLIENTE_AUSENTE', 'LOCAL_CERRADO', 'RECHAZO_PEDIDO', 'DIRECCION_NO_ENCONTRADA', 'SIN_DINERO', 'OTRO');

-- AlterTable
ALTER TABLE "DeliveryRoute" ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "arrivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "routeId" TEXT,
    "userId" TEXT,
    "reason" "DeliveryFailReason" NOT NULL,
    "notes" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAttempt_orderId_idx" ON "DeliveryAttempt"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_routeId_idx" ON "DeliveryAttempt"("routeId");

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "DeliveryRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
