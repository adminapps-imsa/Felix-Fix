-- Productos Dañados: el NF pasa por Gof (documento 1700) antes del supervisor GOF.
--
--   Pendiente --(compradora: NF)-----------------------------> Rechazado (NF, lo recibe Gof)
--   Rechazado --(Gof: check "Documento 1700")----------------> NFValidacion (lo recibe supervisorGof)
--   NFValidacion --(supervisorGof: validar y cerrar)---------> Cerrado
--   (el número lo escribe el supervisor GOF: ver 014, «Documento salida de NF»)
--
-- El camino de Devolución aprobada no cambia (ver 010). Los NF que ya estaban
-- en Rechazado quedan con Gof para su documento 1700.
-- Idempotente, igual que el resto de las migraciones.

-- La 014 la renombra a DocumentoSalidaNf: si ya existe esa, no se vuelve a crear.
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'Documento1700') IS NULL
   AND COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'DocumentoSalidaNf') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD Documento1700 NVARCHAR(50) NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado')
      AND definition NOT LIKE '%NFValidacion%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanado DROP CONSTRAINT CK_Reportes_Estado;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reportes_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD CONSTRAINT CK_Reportes_Estado CHECK (Estado IN (
        'Pendiente', 'Aprobado', 'Rechazado', 'NFValidacion', 'EnProceso', 'Procesado', 'EnContabilidad', 'Cerrado'));
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial')
      AND definition NOT LIKE '%Documento1700%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial DROP CONSTRAINT CK_Historial_Accion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial ADD CONSTRAINT CK_Historial_Accion CHECK (Accion IN (
        'Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError',
        'CorreosActualizados', 'AdjuntoAgregado', 'AdjuntoEliminado', 'EnviadoProveedor',
        'EnviadoContabilidad', 'PagoRecibido', 'NFCerrado', 'Documento1700'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '013_productos_danados_nf_documento_1700.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('013_productos_danados_nf_documento_1700.sql');
GO
