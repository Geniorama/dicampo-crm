-- Quien cuenta en metas y ventas del equipo, y quien puede ser "asesor" de una cotizacion.
ALTER TABLE "User" ADD COLUMN "inSalesTeam" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "canBeSeller" BOOLEAN NOT NULL DEFAULT true;
