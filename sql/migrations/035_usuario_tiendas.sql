-- Tiendas por usuario (pedido del 2026-11-12, Configuración → Tiendas).
--
-- Cada usuario del portal puede quedar en UNA tienda: entonces ve solo lo de
-- esa tienda (Productos Dañados de esa tienda y reclamos de Tienda con esa
-- sucursal; no los de CEDI) y solo crea casos de ella. Quien no está aquí, o
-- tiene TiendaId NULL, ve todas las tiendas, como hasta ahora.
-- SoloPropios = 1: además ve solo los casos que creó él mismo.
-- La regla está en src/domain/tienda.js y src/services/acceso/alcanceTienda.js.
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'UsuarioTiendas' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).UsuarioTiendas (
        Username        VARCHAR(150)    NOT NULL CONSTRAINT PK_UsuarioTiendas PRIMARY KEY,   -- username de Keycloak, en minúsculas
        TiendaId        INT             NULL CONSTRAINT FK_UsuarioTiendas_Tiendas REFERENCES $(SCHEMA).Tiendas (TiendaId),
        SoloPropios     BIT             NOT NULL CONSTRAINT DF_UsuarioTiendas_SoloPropios DEFAULT 0,
        UpdatedAt       DATETIME2       NOT NULL CONSTRAINT DF_UsuarioTiendas_UpdatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedBy       VARCHAR(150)    NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '035_usuario_tiendas.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('035_usuario_tiendas.sql');
GO
