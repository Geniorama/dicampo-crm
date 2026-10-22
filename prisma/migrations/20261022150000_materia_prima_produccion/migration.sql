-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COMPRAS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'MUESTRA';
ALTER TYPE "StockMovementType" ADD VALUE 'DEVOLUCION_DANADA';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseFruit" TEXT,
ADD COLUMN     "expectedYieldPct" INTEGER;

-- CreateTable
CREATE TABLE "FruitPurchase" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fruit" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "kg" DECIMAL(12,3) NOT NULL,
    "baseCost" DECIMAL(14,2) NOT NULL,
    "cost" DECIMAL(14,2) NOT NULL,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FruitPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fruitKg" DECIMAL(12,3) NOT NULL,
    "publicKg" DECIMAL(12,3) NOT NULL,
    "bulkKg" DECIMAL(12,3) NOT NULL,
    "wasteKg" DECIMAL(12,3) NOT NULL,
    "fruitCost" DECIMAL(14,2),
    "lotId" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FruitPurchase_fruit_date_idx" ON "FruitPurchase"("fruit", "date");

-- CreateIndex
CREATE INDEX "FruitPurchase_date_idx" ON "FruitPurchase"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_lotId_key" ON "ProductionBatch"("lotId");

-- CreateIndex
CREATE INDEX "ProductionBatch_productId_date_idx" ON "ProductionBatch"("productId", "date");

-- CreateIndex
CREATE INDEX "ProductionBatch_date_idx" ON "ProductionBatch"("date");

-- AddForeignKey
ALTER TABLE "FruitPurchase" ADD CONSTRAINT "FruitPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

