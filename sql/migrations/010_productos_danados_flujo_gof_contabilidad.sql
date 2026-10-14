-- Productos Dañados: flujo después de la respuesta del proveedor.
--
--   Pendiente --(compradora: NF)-------------------> Rechazado (NF, lo recibe supervisorGof)
--   Rechazado --(supervisorGof: cerrar NF)----------> Cerrado
--   Pendiente --(compradora: Devolución aprobada)---> Aprobado (lo recibe Gof)
--   Aprobado  --(Gof: sube PDF/Excel y envía)-------> EnContabilidad
--   EnContabilidad --(Contabilidad: pago recibido)--> Cerrado
--
-- Resolucion guarda cómo terminó ('Devolucion' | 'NF') para distinguir los
-- cerrados. Los documentos de Gof van en Adjuntos con "etapa": "gof".
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'Resolucion') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD Resolucion VARCHAR(20) NULL;
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'PagoReferencia') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD PagoReferencia NVARCHAR(200) NULL;
GO

UPDATE $(SCHEMA).ReportesProductoDanado SET Resolucion = 'NF' WHERE Resolucion IS NULL AND Estado = 'Rechazado';
UPDATE $(SCHEMA).ReportesProductoDanado SET Resolucion = 'Devolucion' WHERE Resolucion IS NULL AND Estado IN ('Aprobado', 'EnProceso', 'Procesado');
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado')
      AND definition NOT LIKE '%EnContabilidad%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanado DROP CONSTRAINT CK_Reportes_Estado;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD CONSTRAINT CK_Reportes_Estado CHECK (Estado IN (
        'Pendiente', 'Aprobado', 'Rechazado', 'EnProceso', 'Procesado', 'EnContabilidad', 'Cerrado'));
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial')
      AND definition NOT LIKE '%PagoRecibido%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial DROP CONSTRAINT CK_Historial_Accion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial ADD CONSTRAINT CK_Historial_Accion CHECK (Accion IN (
        'Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError',
        'CorreosActualizados', 'AdjuntoAgregado', 'AdjuntoEliminado', 'EnviadoProveedor',
        'EnviadoContabilidad', 'PagoRecibido', 'NFCerrado'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '010_productos_danados_flujo_gof_contabilidad.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('010_productos_danados_flujo_gof_contabilidad.sql');
GO
