-- Reclamos: motivo «Sobrante no esperado» (hoja de la plantilla CEDI por
-- hojas, pedido del 2026-11-12).
--   * El código de barras es opcional en esos productos: CodigoBarra admite NULL.
--   * Referencia, Color y Talla: las columnas de la hoja, para el aviso a Data.
--   * EsperaData = 1: el artículo no está creado en SAP (o vino sin código).
--     La compradora no lo puede decidir hasta que Data lo cree en SAP y cargue
--     su código en el portal (CodigoDataBy / CodigoDataAt).
--   * CK_Reclamos_Tipo acepta el tipo nuevo.
-- No cambia datos existentes. Idempotente.

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('$(SCHEMA).ReclamoLineas') AND name = 'CodigoBarra' AND is_nullable = 0
)
    ALTER TABLE $(SCHEMA).ReclamoLineas ALTER COLUMN CodigoBarra VARCHAR(50) NULL;
GO

IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'Referencia') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD Referencia NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'Color') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD Color NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'Talla') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD Talla NVARCHAR(50) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'EsperaData') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD EsperaData BIT NOT NULL CONSTRAINT DF_ReclamoLineas_EsperaData DEFAULT 0;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'CodigoDataBy') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD CodigoDataBy VARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'CodigoDataAt') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD CodigoDataAt DATETIME2 NULL;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reclamos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos')
      AND definition NOT LIKE '%sobrante_no_esperado%'
)
    ALTER TABLE $(SCHEMA).Reclamos DROP CONSTRAINT CK_Reclamos_Tipo;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Tipo CHECK (Tipo IN
        ('faltante_real', 'sobrante_real', 'sobrante_no_esperado', 'diferencias', 'danos_textil', 'danos_perfumeria_cliente', 'danos_perfumeria_gof', 'devolucion'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '031_reclamos_sobrante_no_esperado.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('031_reclamos_sobrante_no_esperado.sql');
GO
