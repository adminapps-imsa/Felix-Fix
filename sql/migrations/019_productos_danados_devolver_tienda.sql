-- Productos Dañados: la compradora devuelve el reporte a la tienda para corregirlo.
--
--   Pendiente --(compradora: «Devolver a la tienda» + comentario)--> Devuelto
--   Devuelto  --(tienda: corrige el formulario y «Reenviar»)-------> Pendiente
--
-- Solo antes de enviarlo al proveedor (EnviadoProveedorAt vacío). Lo corrige
-- quien lo creó o cualquiera con «Crear reportes». Cada devolución y cada
-- corrección quedan en el historial (DevueltoTienda / Corregido).
-- Idempotente, igual que el resto de las migraciones.

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado')
      AND definition NOT LIKE '%Devuelto%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanado DROP CONSTRAINT CK_Reportes_Estado;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD CONSTRAINT CK_Reportes_Estado CHECK (Estado IN (
        'Pendiente', 'Devuelto', 'Aprobado', 'Rechazado', 'NFValidacion', 'EnProceso', 'Procesado', 'EnContabilidad', 'Cerrado'));
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial')
      AND definition NOT LIKE '%DevueltoTienda%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial DROP CONSTRAINT CK_Historial_Accion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial ADD CONSTRAINT CK_Historial_Accion CHECK (Accion IN (
        'Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError',
        'CorreosActualizados', 'AdjuntoAgregado', 'AdjuntoEliminado', 'EnviadoProveedor',
        'EnviadoContabilidad', 'PagoRecibido', 'NFCerrado', 'Documento1700',
        'DevueltoTienda', 'Corregido'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '019_productos_danados_devolver_tienda.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('019_productos_danados_devolver_tienda.sql');
GO
