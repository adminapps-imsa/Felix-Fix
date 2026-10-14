-- Productos Dañados: envío del reporte al proveedor por correo.
--
-- Flujo: la tienda crea el reporte, la compradora lo revisa y lo envía al
-- proveedor; el proveedor responde y la compradora registra la respuesta:
-- "Devolución aprobada" (Aprobado: el proveedor se hace responsable) o
-- "NF" (Rechazado: la cuenta queda para la empresa).
--
-- El estado del reporte no cambia al enviar: se guarda cuándo y quién lo
-- envió (el último envío) y cuántas veces, y cada envío queda en el historial.
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'EnviadoProveedorAt') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD EnviadoProveedorAt DATETIME2 NULL;
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'EnviadoProveedorPor') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD EnviadoProveedorPor NVARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'EnviosProveedor') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD EnviosProveedor INT NOT NULL CONSTRAINT DF_Reportes_EnviosProveedor DEFAULT 0;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial')
      AND definition NOT LIKE '%EnviadoProveedor%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial DROP CONSTRAINT CK_Historial_Accion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial ADD CONSTRAINT CK_Historial_Accion CHECK (Accion IN (
        'Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError',
        'CorreosActualizados', 'AdjuntoAgregado', 'AdjuntoEliminado', 'EnviadoProveedor'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '009_productos_danados_envio_proveedor.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('009_productos_danados_envio_proveedor.sql');
GO
