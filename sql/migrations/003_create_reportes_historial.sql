-- Auditoría: quién y cuándo aprobó/rechazó/procesó cada reporte, incluyendo
-- intentos fallidos de baja en SAP (para poder diagnosticar reintentos).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReportesProductoDanadoHistorial' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReportesProductoDanadoHistorial (
        HistorialId     BIGINT          IDENTITY(1,1) PRIMARY KEY,
        ReporteId       BIGINT          NOT NULL,
        Accion          VARCHAR(30)     NOT NULL,
        EstadoAnterior  VARCHAR(20)     NULL,
        EstadoNuevo     VARCHAR(20)     NULL,
        UsuarioId       VARCHAR(150)    NOT NULL, -- 'sub' del JWT
        UsuarioNombre   VARCHAR(150)    NULL,
        Detalle         NVARCHAR(1000)  NULL,      -- motivo de rechazo, mensaje de error SAP saneado (sin credenciales)
        FechaEvento     DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_Historial_Reporte FOREIGN KEY (ReporteId) REFERENCES $(SCHEMA).ReportesProductoDanado (ReporteId),
        CONSTRAINT CK_Historial_Accion CHECK (Accion IN ('Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError'))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Historial_ReporteId' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    CREATE INDEX IX_Historial_ReporteId ON $(SCHEMA).ReportesProductoDanadoHistorial (ReporteId, FechaEvento);
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '003_create_reportes_historial.sql')
BEGIN
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('003_create_reportes_historial.sql');
END
GO
