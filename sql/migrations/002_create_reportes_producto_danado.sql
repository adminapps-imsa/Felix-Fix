-- Tabla principal de reportes de productos dados de baja por deterioro,
-- daño, vencimiento o cambio/devolución.
--
-- Nota sobre el estado 'EnProceso': es un estado transitorio (no pedido
-- explícitamente por el negocio) que existe solo para evitar condiciones de
-- carrera cuando dos usuarios aprueban/procesan el mismo reporte a la vez o
-- ante un doble clic. La transición Aprobado -> EnProceso -> Procesado se
-- hace con UPDATE condicional (WHERE Estado = '...') en la capa de servicio;
-- ver src/services/productosDanadosService.js.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReportesProductoDanado' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReportesProductoDanado (
        ReporteId               BIGINT          IDENTITY(1,1) PRIMARY KEY,
        TiendaId                INT             NOT NULL,
        EmpleadoReportaNombre   VARCHAR(150)    NOT NULL,
        EmpleadoReportaUsuario  VARCHAR(150)    NOT NULL, -- derivado del JWT (sub/preferred_username), nunca del body
        Sku                     VARCHAR(50)     NOT NULL,
        CodigoBarras            VARCHAR(50)     NULL,
        NombreProducto          VARCHAR(200)    NOT NULL,
        Marca                   VARCHAR(100)    NULL,
        Categoria               VARCHAR(100)    NULL,
        Motivo                  VARCHAR(30)     NOT NULL,
        Cantidad                DECIMAL(18,3)   NOT NULL,
        Descripcion             NVARCHAR(1000)  NULL,
        EvidenciaProveedor      VARCHAR(20)     NOT NULL DEFAULT 'local', -- 'local' | 'paperless'
        EvidenciaKey            NVARCHAR(500)   NULL,                    -- clave opaca de storage, no path/URL pública
        Estado                  VARCHAR(20)     NOT NULL DEFAULT 'Pendiente',
        MotivoRechazo           NVARCHAR(500)   NULL,
        ProcesadoIntentos       INT             NOT NULL DEFAULT 0,
        SapDocumentoId          VARCHAR(50)     NULL,
        RowVersion              ROWVERSION      NOT NULL,
        FechaCreacion           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        FechaActualizacion      DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_Reportes_Tienda FOREIGN KEY (TiendaId) REFERENCES $(SCHEMA).Tiendas (TiendaId),
        CONSTRAINT CK_Reportes_Motivo CHECK (Motivo IN ('Deterioro', 'Dano', 'Vencimiento', 'CambioDevolucion')),
        CONSTRAINT CK_Reportes_Estado CHECK (Estado IN ('Pendiente', 'Aprobado', 'Rechazado', 'EnProceso', 'Procesado')),
        CONSTRAINT CK_Reportes_Cantidad CHECK (Cantidad > 0 AND Cantidad <= 100000),
        CONSTRAINT CK_Reportes_EvidenciaProveedor CHECK (EvidenciaProveedor IN ('local', 'paperless'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_Estado' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    CREATE INDEX IX_Reportes_Estado ON $(SCHEMA).ReportesProductoDanado (Estado) INCLUDE (TiendaId, Cantidad, FechaCreacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_TiendaId' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    CREATE INDEX IX_Reportes_TiendaId ON $(SCHEMA).ReportesProductoDanado (TiendaId, FechaCreacion DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_Sku' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    CREATE INDEX IX_Reportes_Sku ON $(SCHEMA).ReportesProductoDanado (Sku);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_CodigoBarras' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    CREATE INDEX IX_Reportes_CodigoBarras ON $(SCHEMA).ReportesProductoDanado (CodigoBarras);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_FechaCreacion' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    CREATE INDEX IX_Reportes_FechaCreacion ON $(SCHEMA).ReportesProductoDanado (FechaCreacion DESC);
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '002_create_reportes_producto_danado.sql')
BEGIN
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('002_create_reportes_producto_danado.sql');
END
GO
