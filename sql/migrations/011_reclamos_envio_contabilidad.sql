-- Reclamos: envío a contabilidad.
--
-- Cuando la compradora cierra el reclamo (resuelto o rechazado) puede
-- enviarlo por correo a contabilidad, con los productos y los adjuntos.
-- Se guarda el último envío (se puede reenviar).
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).Reclamos', 'EnviadoContabilidadAt') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD EnviadoContabilidadAt DATETIME2 NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'EnviadoContabilidadBy') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD EnviadoContabilidadBy VARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'EnviadoContabilidadA') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD EnviadoContabilidadA NVARCHAR(1000) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '011_reclamos_envio_contabilidad.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('011_reclamos_envio_contabilidad.sql');
GO
