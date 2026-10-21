-- Compradoras: qué usuario del portal es cada compradora del catálogo de
-- FelixApproval (compradoras_proveedores). Con esto cada compradora ve solo
-- los casos de sus mundos y marcas (src/services/acceso/alcanceCompradora.js).
-- Quien no está aquí (u otro rol) ve todo, como hasta ahora.
-- Emparejados el 2026-10-21 por nombre contra Keycloak.
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CompradoraUsuarios' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).CompradoraUsuarios (
        Username        VARCHAR(150)    NOT NULL CONSTRAINT PK_CompradoraUsuarios PRIMARY KEY,
        NombreCatalogo  NVARCHAR(150)   NOT NULL,   -- como está en compradoras_proveedores.compradora
        CreatedAt       DATETIME2       NOT NULL CONSTRAINT DF_CompradoraUsuarios_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END
GO

MERGE $(SCHEMA).CompradoraUsuarios AS d
USING (VALUES
    ('kmock',            N'KAREEN MOCK'),
    ('zlopez',           N'ZANYA LOPEZ'),
    ('vvillasana',       N'VITTORIA VILLASANA'),
    ('fquiros',          N'FERNANDA QUIROS'),
    ('jgarciadeparedes', N'JENNIFER G. DE PAREDES'),
    ('abatista',         N'ALMA BATISTA'),
    ('ksamuels',         N'KARINA SAMUELS'),
    ('anlopez',          N'ANA GABRIELA LOPEZ')
) AS o (Username, NombreCatalogo)
ON d.Username = o.Username
WHEN NOT MATCHED THEN INSERT (Username, NombreCatalogo) VALUES (o.Username, o.NombreCatalogo);
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '020_compradora_usuarios.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('020_compradora_usuarios.sql');
GO
