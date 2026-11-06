-- Cliente = tiene (o tuvo) una cotizacion. Los prospectos sin cotizacion se
-- quedan en el pipeline y salen del modulo de Clientes.
-- Historico: los prospectos que ya tienen cotizaciones (las del Excel) pasan a ACTIVO.
UPDATE "Client" c SET "status" = 'ACTIVO'
WHERE c."status" = 'PROSPECTO'
  AND EXISTS (SELECT 1 FROM "Quote" q WHERE q."clientId" = c.id);
