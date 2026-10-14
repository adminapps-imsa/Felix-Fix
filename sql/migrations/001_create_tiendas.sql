-- Catálogo de tiendas/sucursales.
-- DECISIÓN PENDIENTE: el usuario aún no entregó el catálogo real de tiendas.
-- Las filas sembradas al final son solo de EJEMPLO y deben reemplazarse.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Tiendas' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).Tiendas (
        TiendaId        INT             IDENTITY(1,1) PRIMARY KEY,
        Codigo          VARCHAR(20)     NOT NULL,
        Nombre          VARCHAR(100)    NOT NULL,
        Direccion       VARCHAR(255)    NULL,
        Activo          BIT             NOT NULL DEFAULT 1,
        FechaCreacion   DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_Tiendas_Codigo UNIQUE (Codigo)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '001_create_tiendas.sql')
BEGIN
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('001_create_tiendas.sql');
END
GO
