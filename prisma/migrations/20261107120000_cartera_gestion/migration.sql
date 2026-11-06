-- CreateEnum
CREATE TYPE "PaymentReceiver" AS ENUM ('DAVID', 'DOMICILIARIO', 'KAREN_CARTERA', 'ASESOR');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDIENTE_PAGO', 'RECAUDADO', 'NO_CONTESTA', 'ACUERDO_PAGO');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'BANCOLOMBIA';
ALTER TYPE "PaymentMethod" ADD VALUE 'CAJA_SOCIAL';
ALTER TYPE "PaymentMethod" ADD VALUE 'NEQUI';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "collectionStatus" "CollectionStatus" NOT NULL DEFAULT 'PENDIENTE_PAGO',
ADD COLUMN "collectionNote" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "receivedBy" "PaymentReceiver";
