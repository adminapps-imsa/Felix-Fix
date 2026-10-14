-- Productos Dañados: el número lo escribe el supervisor GOF al validar el NF.
--
--   Rechazado --(Gof: check «Documento 1700»)---------------------------> NFValidacion
--   NFValidacion --(supervisorGof: «Documento salida de NF» + validar)--> Cerrado
--
-- La columna Documento1700 de la 013 pasa a llamarse DocumentoSalidaNf (el
-- número que escribe el supervisor). Si la 013 nunca creó la columna, se crea.
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'Documento1700') IS NOT NULL
   AND COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'DocumentoSalidaNf') IS NULL
    EXEC sp_rename '$(SCHEMA).ReportesProductoDanado.Documento1700', 'DocumentoSalidaNf', 'COLUMN';
GO

IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'DocumentoSalidaNf') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD DocumentoSalidaNf NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '014_productos_danados_documento_salida_nf.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('014_productos_danados_documento_salida_nf.sql');
GO
