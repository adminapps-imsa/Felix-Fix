-- Respuesta del proveedor a la nota de débito (pedido del 2026-11-18).
-- Contabilidad la registra en el detalle del documento y el documento deja de
-- estar pendiente:
--   'aprobado'     el proveedor aprobó: se sube la nota de crédito.
--   'no_aprobado'  no aprobó: se escribe el número de registro SAP y se sube el documento.
-- Se puede quitar (vuelve a 'pendiente') si se registró por error.
-- Idempotente.

IF COL_LENGTH('$(SCHEMA).ReclamoDocumentosContabilidad', 'RespuestaAt') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD
        RespuestaAt DATETIME2 NULL,
        RespuestaPor NVARCHAR(150) NULL,
        RegistroSap NVARCHAR(50) NULL,
        RespuestaArchivo NVARCHAR(255) NULL,        -- nombre opaco en disco (carpeta de reclamos)
        RespuestaArchivoNombre NVARCHAR(255) NULL;  -- nombre original, para mostrar y descargar
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad')
           AND definition NOT LIKE '%no_aprobado%')
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad DROP CONSTRAINT CK_ReclamoDocsConta_Estado;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad'))
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD CONSTRAINT CK_ReclamoDocsConta_Estado CHECK (Estado IN ('pendiente', 'aprobado', 'no_aprobado'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '046_contabilidad_respuesta_proveedor.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('046_contabilidad_respuesta_proveedor.sql');
GO
