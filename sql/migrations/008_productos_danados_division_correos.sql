-- Productos Dañados: División y Motivo con catálogo que crece solo, SKU
-- opcional, y correos de proveedor + adjuntos (PDF/Excel) por reporte para el
-- futuro envío del reporte por correo.
--
-- - SKU deja de pedirse en el formulario: la columna pasa a admitir NULL (los
--   reportes viejos conservan el suyo). El producto se identifica por el
--   código de barras.
-- - Motivo deja de ser una lista fija (CHECK) y pasa a ReclamoCatalogos con
--   Tipo = 'motivo_producto'. Los códigos viejos se reescriben a su texto
--   ('Dano' -> 'Daño'), que es lo que guarda el catálogo.
-- - División usa el mismo catálogo 'division' que Reclamos (Maquillaje,
--   Tratamiento, Accesorios, PIB…): una división nueva aparece en ambos.
-- - Categoria se conserva (datos viejos) pero ya no se pide.
-- Idempotente, igual que el resto de las migraciones.

-- SKU opcional. El índice sobre Sku impide cambiar la columna y ya no se usa.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reportes_Sku' AND object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    DROP INDEX IX_Reportes_Sku ON $(SCHEMA).ReportesProductoDanado;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado') AND name = 'Sku' AND is_nullable = 0)
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ALTER COLUMN Sku VARCHAR(50) NULL;
GO

-- Motivo: texto libre del catálogo.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reportes_Motivo' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanado DROP CONSTRAINT CK_Reportes_Motivo;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanado') AND name = 'Motivo' AND system_type_id <> TYPE_ID('nvarchar'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ALTER COLUMN Motivo NVARCHAR(100) NOT NULL;
GO
UPDATE $(SCHEMA).ReportesProductoDanado SET Motivo = N'Daño' WHERE Motivo = 'Dano';
UPDATE $(SCHEMA).ReportesProductoDanado SET Motivo = N'Cambio / Devolución' WHERE Motivo = 'CambioDevolucion';
GO

IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'Division') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD Division NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'CorreosProveedor') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD CorreosProveedor NVARCHAR(MAX) NULL; -- JSON ["a@b.com", …]
IF COL_LENGTH('$(SCHEMA).ReportesProductoDanado', 'Adjuntos') IS NULL
    ALTER TABLE $(SCHEMA).ReportesProductoDanado ADD Adjuntos NVARCHAR(MAX) NULL;         -- JSON [{filename, originalname, tipo, uploaded_at, uploaded_by}]
GO

-- Catálogo: nuevo tipo 'motivo_producto'.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ReclamoCatalogos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoCatalogos')
      AND definition NOT LIKE '%motivo_producto%'
)
    ALTER TABLE $(SCHEMA).ReclamoCatalogos DROP CONSTRAINT CK_ReclamoCatalogos_Tipo;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoCatalogos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoCatalogos'))
    ALTER TABLE $(SCHEMA).ReclamoCatalogos ADD CONSTRAINT CK_ReclamoCatalogos_Tipo CHECK (Tipo IN ('division', 'motivo', 'motivo_producto'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'motivo_producto' AND Valor = N'Deterioro')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('motivo_producto', N'Deterioro');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'motivo_producto' AND Valor = N'Daño')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('motivo_producto', N'Daño');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'motivo_producto' AND Valor = N'Vencimiento')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('motivo_producto', N'Vencimiento');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'motivo_producto' AND Valor = N'Cambio / Devolución')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('motivo_producto', N'Cambio / Devolución');
GO

-- Historial: cambios de correos y adjuntos.
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial')
      AND definition NOT LIKE '%AdjuntoAgregado%'
)
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial DROP CONSTRAINT CK_Historial_Accion;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Historial_Accion' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReportesProductoDanadoHistorial'))
    ALTER TABLE $(SCHEMA).ReportesProductoDanadoHistorial ADD CONSTRAINT CK_Historial_Accion CHECK (Accion IN (
        'Creado', 'Aprobado', 'Rechazado', 'EnProceso', 'ProcesadoOk', 'ProcesadoError',
        'CorreosActualizados', 'AdjuntoAgregado', 'AdjuntoEliminado'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '008_productos_danados_division_correos.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('008_productos_danados_division_correos.sql');
GO
