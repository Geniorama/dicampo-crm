-- La cotizacion crea el pedido al guardar y solo tiene tres estados contables.
-- Historico: lo rechazado pasa a ANULADO; las 2.097 cotizaciones vencidas del Excel
-- (historico sin pedido) quedan FACTURADO para no llenar la cola de pendientes.
ALTER TYPE "QuoteStatus" RENAME TO "QuoteStatus_old";
CREATE TYPE "QuoteStatus" AS ENUM ('PENDIENTE_FACTURAR', 'FACTURADO', 'ANULADO');
ALTER TABLE "Quote" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Quote" ALTER COLUMN "status" TYPE "QuoteStatus"
  USING (CASE WHEN "status"::text = 'RECHAZADA' THEN 'ANULADO' WHEN "status"::text = 'VENCIDA' THEN 'FACTURADO' ELSE 'PENDIENTE_FACTURAR' END)::"QuoteStatus";
ALTER TABLE "Quote" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE_FACTURAR';
DROP TYPE "QuoteStatus_old";

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "isNewClient" BOOLEAN NOT NULL DEFAULT false;
