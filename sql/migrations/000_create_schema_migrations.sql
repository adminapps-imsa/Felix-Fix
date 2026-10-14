-- Control mínimo de migraciones aplicadas (no hay ORM en este proyecto).
-- Ejecutar cada script de esta carpeta en orden numérico; antes de correr uno,
-- verificar que su nombre no exista ya en $(SCHEMA).SchemaMigrations.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SchemaMigrations' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).SchemaMigrations (
        Nombre          VARCHAR(200)    NOT NULL PRIMARY KEY,
        FechaAplicada   DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '000_create_schema_migrations.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('000_create_schema_migrations.sql');
GO
