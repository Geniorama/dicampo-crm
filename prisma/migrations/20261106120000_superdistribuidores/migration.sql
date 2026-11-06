-- AlterTable
ALTER TABLE "Client" ADD COLUMN "isSuperDistributor" BOOLEAN NOT NULL DEFAULT false;

-- Los 8 superdistribuidores de Dicampo, por nombre (razon social o comercial).
-- Idempotente; despues se corrige desde la ficha del cliente (solo ADMIN).
UPDATE "Client" SET "isSuperDistributor" = true
WHERE
  "businessName" ILIKE '%bocana%'
  OR ("businessName" ILIKE '%llanos%' AND ("businessName" ILIKE '%dani%' OR "businessName" ILIKE '%dany%'))
  OR "businessName" ILIKE '%dolcella%'
  OR ("businessName" ILIKE '%elizabeth%' AND "businessName" ILIKE '%vargas%')
  OR "businessName" ILIKE '%frupulpas%'
  OR "businessName" ILIKE '%paruby%'
  OR "businessName" ILIKE '%secam%'
  OR "businessName" ILIKE '%romanoti%'
  OR "tradeName" ILIKE '%bocana%'
  OR "tradeName" ILIKE '%dolcella%'
  OR "tradeName" ILIKE '%frupulpas%'
  OR "tradeName" ILIKE '%paruby%'
  OR "tradeName" ILIKE '%secam%'
  OR "tradeName" ILIKE '%romanoti%';

-- CreateIndex
CREATE INDEX "Client_isSuperDistributor_idx" ON "Client"("isSuperDistributor");
