-- REC-000001 y REC-000002 de Prod pasan a «Devolución al proveedor» (pedido del
-- 2026-10-28): el tipo del reclamo y el motivo de cada producto. Con eso
-- muestran el «Retiro del proveedor» (src/domain/reclamo.js: esDevolucion).
-- Solo en Prod: en QA esos números son otros reclamos y no se tocan.
-- Idempotente, igual que el resto de las migraciones.

IF '$(SCHEMA)' = 'Prod'
BEGIN
    UPDATE $(SCHEMA).ReclamoLineas SET Tipo = 'devolucion'
    WHERE Tipo <> 'devolucion'
      AND ReclamoToken IN (SELECT Token FROM $(SCHEMA).Reclamos WHERE ReclamoId IN (1, 2));
    UPDATE $(SCHEMA).Reclamos SET Tipo = 'devolucion' WHERE ReclamoId IN (1, 2) AND Tipo <> 'devolucion';
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '024_prod_reclamos_1_2_devolucion.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('024_prod_reclamos_1_2_devolucion.sql');
GO
