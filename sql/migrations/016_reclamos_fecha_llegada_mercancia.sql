-- Reclamos: fecha en que llegó la mercancía. Obligatoria al crear un reclamo
-- (Tienda y CEDI); la API la exige y revisa que no sea futura
-- (motivoFechaLlegadaInvalida en src/domain/reclamo.js). Queda NULL en los
-- reclamos creados antes de esta migración.
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).Reclamos', 'FechaLlegadaMercancia') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD FechaLlegadaMercancia DATE NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '016_reclamos_fecha_llegada_mercancia.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('016_reclamos_fecha_llegada_mercancia.sql');
GO
