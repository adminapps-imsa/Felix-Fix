-- Módulo Reclamos (faltante / sobrante / diferencias / daños).
--
-- Se sigue la convención PascalCase del resto de la base. Equivalencias con
-- el diseño funcional original (snake_case):
--   reclamos        -> $(SCHEMA).Reclamos
--   reclamo_lineas  -> $(SCHEMA).ReclamoLineas
--
-- Idempotente: cada tabla/columna/índice se crea solo si no existe, así que
-- se puede volver a correr (y sirve para agregar columnas nuevas a una tabla
-- que ya se creó con una versión anterior de este script).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Reclamos' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).Reclamos (
        ReclamoId               BIGINT              IDENTITY(1,1) PRIMARY KEY,
        Token                   UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWID(), -- usado en URLs, nunca el Id secuencial
        Tipo                    VARCHAR(40)         NOT NULL,
        Origen                  VARCHAR(10)         NOT NULL,                -- 'tienda' | 'cedi'
        Status                  VARCHAR(15)         NOT NULL DEFAULT 'pendiente',
        CreatedAt               DATETIME2           NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy               VARCHAR(150)        NOT NULL,
        CONSTRAINT UQ_Reclamos_Token UNIQUE (Token)
    );
END
GO

-- Columnas agregadas una por una (idempotente) para poder evolucionar la tabla.
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Sucursal') IS NULL              ALTER TABLE $(SCHEMA).Reclamos ADD Sucursal NVARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'NumeroEmbarqueFactura') IS NULL ALTER TABLE $(SCHEMA).Reclamos ADD NumeroEmbarqueFactura NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'FechaRegistro') IS NULL         ALTER TABLE $(SCHEMA).Reclamos ADD FechaRegistro DATE NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Mundo') IS NULL                 ALTER TABLE $(SCHEMA).Reclamos ADD Mundo NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Departamento') IS NULL          ALTER TABLE $(SCHEMA).Reclamos ADD Departamento NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Marca') IS NULL                 ALTER TABLE $(SCHEMA).Reclamos ADD Marca NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Proveedor') IS NULL             ALTER TABLE $(SCHEMA).Reclamos ADD Proveedor NVARCHAR(200) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Compradora') IS NULL            ALTER TABLE $(SCHEMA).Reclamos ADD Compradora NVARCHAR(150) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'SapDoc1') IS NULL               ALTER TABLE $(SCHEMA).Reclamos ADD SapDoc1 NVARCHAR(50) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'SapDoc2') IS NULL               ALTER TABLE $(SCHEMA).Reclamos ADD SapDoc2 NVARCHAR(50) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'SapDoc3') IS NULL               ALTER TABLE $(SCHEMA).Reclamos ADD SapDoc3 NVARCHAR(50) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'SapDocsExtra') IS NULL          ALTER TABLE $(SCHEMA).Reclamos ADD SapDocsExtra NVARCHAR(MAX) NULL;   -- JSON array de strings (docs 4+)
IF COL_LENGTH('$(SCHEMA).Reclamos', 'ArchivoExcel') IS NULL          ALTER TABLE $(SCHEMA).Reclamos ADD ArchivoExcel NVARCHAR(200) NULL;   -- nombre opaco en disco
IF COL_LENGTH('$(SCHEMA).Reclamos', 'ArchivoExcelNombre') IS NULL    ALTER TABLE $(SCHEMA).Reclamos ADD ArchivoExcelNombre NVARCHAR(255) NULL; -- nombre original, solo para mostrar
IF COL_LENGTH('$(SCHEMA).Reclamos', 'ImagenesExcel') IS NULL         ALTER TABLE $(SCHEMA).Reclamos ADD ImagenesExcel NVARCHAR(MAX) NULL;  -- JSON [{filename, sheet, sheetName, origen}]
IF COL_LENGTH('$(SCHEMA).Reclamos', 'AdjuntosExtra') IS NULL         ALTER TABLE $(SCHEMA).Reclamos ADD AdjuntosExtra NVARCHAR(MAX) NULL;  -- JSON [{filename, originalname, tipo, uploaded_at, uploaded_by}]
IF COL_LENGTH('$(SCHEMA).Reclamos', 'Comentario') IS NULL            ALTER TABLE $(SCHEMA).Reclamos ADD Comentario NVARCHAR(1000) NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'DecisionAt') IS NULL            ALTER TABLE $(SCHEMA).Reclamos ADD DecisionAt DATETIME2 NULL;
IF COL_LENGTH('$(SCHEMA).Reclamos', 'DecisionBy') IS NULL            ALTER TABLE $(SCHEMA).Reclamos ADD DecisionBy VARCHAR(150) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Tipo' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Tipo CHECK (Tipo IN
        ('faltante_real', 'sobrante_real', 'diferencias', 'danos_textil', 'danos_perfumeria_cliente', 'danos_perfumeria_gof'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Origen' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Origen CHECK (Origen IN ('tienda', 'cedi'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Status' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Status CHECK (Status IN ('pendiente', 'resuelto', 'rechazado', 'notificado'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Reclamos_Status' AND object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    CREATE INDEX IX_Reclamos_Status ON $(SCHEMA).Reclamos (Status, CreatedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReclamoLineas' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReclamoLineas (
        LineaId         BIGINT              IDENTITY(1,1) PRIMARY KEY,
        ReclamoToken    UNIQUEIDENTIFIER    NOT NULL,
        Posicion        INT                 NOT NULL,   -- 1-based, orden en el Excel
        CodigoBarra     VARCHAR(50)         NOT NULL,
        Cantidad        DECIMAL(18,3)       NULL,
        Tipo            VARCHAR(40)         NOT NULL,   -- motivo de ESTA línea puntual
        DecStatus       VARCHAR(10)         NOT NULL DEFAULT 'pendiente',
        DecComentario   NVARCHAR(500)       NULL,
        DecAt           DATETIME2           NULL,
        DecBy           VARCHAR(150)        NULL,
        CreatedAt       DATETIME2           NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT FK_ReclamoLineas_Reclamo FOREIGN KEY (ReclamoToken) REFERENCES $(SCHEMA).Reclamos (Token),
        CONSTRAINT UQ_ReclamoLineas_Posicion UNIQUE (ReclamoToken, Posicion),
        CONSTRAINT CK_ReclamoLineas_DecStatus CHECK (DecStatus IN ('pendiente', 'aprobado', 'rechazado'))
    );
END
GO

-- Descripción tal como viene en el Excel (fallback cuando SAP no devuelve la del producto).
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'DescripcionExcel') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD DescripcionExcel NVARCHAR(300) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ReclamoLineas_Token' AND object_id = OBJECT_ID('$(SCHEMA).ReclamoLineas'))
    CREATE INDEX IX_ReclamoLineas_Token ON $(SCHEMA).ReclamoLineas (ReclamoToken, Posicion);
GO

-- Relación proveedor -> mundo/departamento/marca, usada para autocompletar
-- el formulario de reclamos. No existía en el portal: se crea VACÍA y hay que
-- cargarla con el catálogo real. Si queda vacía, esos campos simplemente no se
-- autocompletan y el usuario los llena a mano.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ProveedorRelaciones' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ProveedorRelaciones (
        ProveedorRelacionId INT             IDENTITY(1,1) PRIMARY KEY,
        Proveedor           NVARCHAR(200)   NOT NULL,
        Mundo               NVARCHAR(100)   NULL,
        Departamento        NVARCHAR(100)   NULL,
        Marca               NVARCHAR(100)   NULL,
        Activo              BIT             NOT NULL DEFAULT 1
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '005_create_reclamos.sql')
BEGIN
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('005_create_reclamos.sql');
END
GO
