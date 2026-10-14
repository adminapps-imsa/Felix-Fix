-- Reclamos: División (CEDI) y Motivo, con catálogo que crece solo.
--
-- ReclamoCatalogos guarda los valores que se ofrecen en los dropdowns del
-- formulario. Cuando alguien escribe un valor nuevo y crea el reclamo, ese
-- valor se agrega aquí y desde entonces aparece para todos.
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReclamoCatalogos' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReclamoCatalogos (
        ReclamoCatalogoId   INT             IDENTITY(1,1) PRIMARY KEY,
        Tipo                VARCHAR(20)     NOT NULL,               -- 'division' | 'motivo'
        Valor               NVARCHAR(100)   NOT NULL,
        Activo              BIT             NOT NULL DEFAULT 1,
        CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy           VARCHAR(150)    NULL,                   -- NULL = valor inicial de la migración
        CONSTRAINT CK_ReclamoCatalogos_Tipo CHECK (Tipo IN ('division', 'motivo')),
        -- La collation por defecto no distingue mayúsculas: 'pib' y 'PIB' son el mismo valor.
        CONSTRAINT UQ_ReclamoCatalogos_TipoValor UNIQUE (Tipo, Valor)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = 'Maquillaje')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', 'Maquillaje');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = 'Tratamiento')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', 'Tratamiento');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = 'Accesorios')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', 'Accesorios');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = 'PIB')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', 'PIB');
GO

IF COL_LENGTH('$(SCHEMA).Reclamos', 'Division') IS NULL ALTER TABLE $(SCHEMA).Reclamos ADD Division NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Motivo') IS NULL   ALTER TABLE $(SCHEMA).Reclamos ADD Motivo NVARCHAR(100) NULL;
GO

-- El listado ordena por fecha de creación; sin índice cada página recorre la tabla completa.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reclamos_CreatedAt' AND object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    CREATE INDEX IX_Reclamos_CreatedAt ON $(SCHEMA).Reclamos (CreatedAt DESC);
GO

-- KPI "productos por decidir" y la columna de pendientes de cada fila del listado.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReclamoLineas_Pendientes' AND object_id = OBJECT_ID('$(SCHEMA).ReclamoLineas'))
    CREATE INDEX IX_ReclamoLineas_Pendientes ON $(SCHEMA).ReclamoLineas (ReclamoToken) WHERE DecStatus = 'pendiente';
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '006_reclamos_division_motivo.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('006_reclamos_division_motivo.sql');
GO
