-- CreateEnum
CREATE TYPE "VisitCategory" AS ENUM ('DEMOSTRACION', 'FIDELIZACION', 'RECAPACITACION', 'RECUPERACION', 'ENTREGA_PEDIDOS', 'DEVOLUCION_FALTANTES', 'OTRA');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "visitCategory" "VisitCategory";

-- Las visitas ya registradas se etiquetan por su titulo.
UPDATE "Opportunity" SET "visitCategory" = 'DEMOSTRACION' WHERE title = 'Visita cliente nuevo';
UPDATE "Opportunity" SET "visitCategory" = 'FIDELIZACION'
  WHERE title IN ('Visita re-capacitación', 'Visita recuperación', 'Visita entrega pedidos', 'Visita devolución / faltantes');
