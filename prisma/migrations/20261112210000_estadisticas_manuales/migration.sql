-- Estadisticas de los ultimos 6 meses subidas a mano (CD-12): ventas por
-- segmento (mayo a octubre) y clientes nuevos por asesor (agosto a octubre).
CREATE TYPE "ManualStatMetric" AS ENUM ('VENTAS_SEGMENTO', 'CLIENTES_NUEVOS');

CREATE TABLE "ManualStat" (
  "id" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "metric" "ManualStatMetric" NOT NULL,
  "label" TEXT NOT NULL,
  "value" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualStat_month_metric_label_key" ON "ManualStat"("month", "metric", "label");
CREATE INDEX "ManualStat_metric_month_idx" ON "ManualStat"("metric", "month");

INSERT INTO "ManualStat" ("id", "month", "metric", "label", "value") VALUES
  (gen_random_uuid()::text, '2026-05', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 137983215),
  (gen_random_uuid()::text, '2026-06', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 132442759),
  (gen_random_uuid()::text, '2026-07', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 124852599),
  (gen_random_uuid()::text, '2026-08', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 137538791),
  (gen_random_uuid()::text, '2026-09', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 105992460),
  (gen_random_uuid()::text, '2026-10', 'VENTAS_SEGMENTO', 'SUPER_DISTRIBUIDORES', 123674290),
  (gen_random_uuid()::text, '2026-05', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 80389180),
  (gen_random_uuid()::text, '2026-06', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 90753868),
  (gen_random_uuid()::text, '2026-07', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 98436550),
  (gen_random_uuid()::text, '2026-08', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 95112403),
  (gen_random_uuid()::text, '2026-09', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 101745231),
  (gen_random_uuid()::text, '2026-10', 'VENTAS_SEGMENTO', 'GESTION_COMERCIAL', 110979141),
  (gen_random_uuid()::text, '2026-08', 'CLIENTES_NUEVOS', 'Andres', 12),
  (gen_random_uuid()::text, '2026-09', 'CLIENTES_NUEVOS', 'Andres', 18),
  (gen_random_uuid()::text, '2026-10', 'CLIENTES_NUEVOS', 'Andres', 13),
  (gen_random_uuid()::text, '2026-09', 'CLIENTES_NUEVOS', 'Fabian', 9),
  (gen_random_uuid()::text, '2026-10', 'CLIENTES_NUEVOS', 'Fabian', 14),
  (gen_random_uuid()::text, '2026-10', 'CLIENTES_NUEVOS', 'Felipe', 9);
