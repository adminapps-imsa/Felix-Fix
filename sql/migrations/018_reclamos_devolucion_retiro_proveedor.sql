-- Reclamos: tipo «devolución» (el producto vuelve al proveedor) y la marca de
-- que el proveedor ya lo retiró, con el día, la foto y quién lo registró.
-- La marca la pone Gof (permiso reclamos.retiro_proveedor) y NO cambia el
-- estado del reclamo: solo deja constancia.
-- Idempotente, igual que el resto de las migraciones.

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reclamos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos')
      AND definition NOT LIKE '%devolucion%'
)
    ALTER TABLE $(SCHEMA).Reclamos DROP CONSTRAINT CK_Reclamos_Tipo;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Tipo CHECK (Tipo IN
        ('faltante_real', 'sobrante_real', 'diferencias', 'danos_textil', 'danos_perfumeria_cliente', 'danos_perfumeria_gof', 'devolucion'));
GO

IF COL_LENGTH('$(SCHEMA).Reclamos', 'RetiroProveedorFecha') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD RetiroProveedorFecha DATE NULL;           -- día en que el proveedor retiró
IF COL_LENGTH('$(SCHEMA).Reclamos', 'RetiroProveedorFoto') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD RetiroProveedorFoto NVARCHAR(200) NULL;   -- nombre opaco en disco
IF COL_LENGTH('$(SCHEMA).Reclamos', 'RetiroProveedorPor') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD RetiroProveedorPor VARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'RetiroProveedorRegistradoAt') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD RetiroProveedorRegistradoAt DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '018_reclamos_devolucion_retiro_proveedor.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('018_reclamos_devolucion_retiro_proveedor.sql');
GO
