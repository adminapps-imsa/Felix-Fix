-- Contabilidad envía al proveedor la nota de débito de un reclamo (pedido del
-- 2026-11-18): desde el detalle del documento escribe los correos del
-- proveedor y un comentario, y el correo sale con el PDF y los productos.
--   Reclamos.CorreosProveedor: JSON con los correos usados (se proponen la
--     próxima vez para ese reclamo).
--   ReclamoDocumentosContabilidad: el último envío (cuándo, quién, a quién,
--     comentario y cuántas veces) y EnviandoProveedorAt, la reserva mientras
--     sale el correo para que un doble clic no lo mande dos veces.
-- Idempotente.

IF COL_LENGTH('$(SCHEMA).Reclamos', 'CorreosProveedor') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD CorreosProveedor NVARCHAR(MAX) NULL;
GO

IF COL_LENGTH('$(SCHEMA).ReclamoDocumentosContabilidad', 'EnviadoProveedorAt') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD
        EnviadoProveedorAt DATETIME2 NULL,
        EnviadoProveedorPor NVARCHAR(150) NULL,
        EnviadoProveedorA NVARCHAR(2000) NULL,
        ComentarioProveedor NVARCHAR(2000) NULL,
        EnviosProveedor INT NOT NULL CONSTRAINT DF_RecDocCont_EnviosProveedor DEFAULT 0,
        EnviandoProveedorAt DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '045_contabilidad_envio_proveedor.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('045_contabilidad_envio_proveedor.sql');
GO
