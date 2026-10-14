-- Reclamos: bandeja de contabilidad (documentos SAP del reclamo).
--
-- Al enviar un reclamo a contabilidad, cada PDF adjunto (nota de débito de
-- SAP) se lee y se cruza con los productos del reclamo. El resultado queda
-- aquí, un registro por (reclamo, adjunto), para que contabilidad lo vea en
-- su bandeja. Si el reclamo se reenvía, el documento se actualiza mientras
-- siga 'pendiente'.
--
--   Lineas      JSON [{ material, descripcion, cantidadPdf, valor, lineaId, posicion,
--                       codigoBarra, tipo, decision, cantidadReclamo, resultado }]
--   Validacion  JSON { estado, coinciden, noEnReclamo, cantidadDistinta,
--                      aprobados, rechazados, sinDecision, mezclaDecisiones }
--
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReclamoDocumentosContabilidad' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReclamoDocumentosContabilidad (
        DocumentoId         INT                 IDENTITY(1,1) PRIMARY KEY,
        ReclamoId           BIGINT              NOT NULL,
        AdjuntoFilename     NVARCHAR(255)       NOT NULL,   -- nombre opaco en disco (AdjuntosExtra.filename)
        AdjuntoNombre       NVARCHAR(255)       NULL,       -- nombre original, solo para mostrar
        NumeroDocumento     NVARCHAR(50)        NULL,       -- "Doc Num" de SAP
        TipoDocumento       NVARCHAR(100)       NULL,       -- p. ej. "Nota de Debito · Anulación: Devolución Mercancía Local"
        Movimiento          NVARCHAR(150)       NULL,       -- clase de movimiento, p. ej. "912 Anul DEV Mcía Loc"
        FechaDocumento      DATE                NULL,
        Total               DECIMAL(18,2)       NULL,
        Lineas              NVARCHAR(MAX)       NULL,       -- JSON, ver arriba
        Validacion          NVARCHAR(MAX)       NULL,       -- JSON, ver arriba
        -- Por ahora solo 'pendiente': las acciones de contabilidad (revisado,
        -- contabilizado, devuelto…) se definirán después y ampliarán este CHECK.
        Estado              NVARCHAR(30)        NOT NULL CONSTRAINT DF_ReclamoDocsConta_Estado DEFAULT 'pendiente',
        EnviadoAt           DATETIME2           NOT NULL CONSTRAINT DF_ReclamoDocsConta_EnviadoAt DEFAULT SYSUTCDATETIME(),
        EnviadoPor          NVARCHAR(150)       NULL,
        CreatedAt           DATETIME2           NOT NULL CONSTRAINT DF_ReclamoDocsConta_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt           DATETIME2           NOT NULL CONSTRAINT DF_ReclamoDocsConta_UpdatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_ReclamoDocsConta_Reclamo FOREIGN KEY (ReclamoId) REFERENCES $(SCHEMA).Reclamos (ReclamoId),
        CONSTRAINT UQ_ReclamoDocsConta_Adjunto UNIQUE (ReclamoId, AdjuntoFilename)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad'))
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD CONSTRAINT CK_ReclamoDocsConta_Estado CHECK (Estado IN ('pendiente'));
GO

-- Bandeja: filtro por estado, lo más reciente primero.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReclamoDocsConta_Estado' AND object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad'))
    CREATE INDEX IX_ReclamoDocsConta_Estado ON $(SCHEMA).ReclamoDocumentosContabilidad (Estado, EnviadoAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '012_reclamos_documentos_contabilidad.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('012_reclamos_documentos_contabilidad.sql');
GO
