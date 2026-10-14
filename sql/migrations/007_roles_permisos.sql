-- Configuración de acceso: qué puede hacer cada rol.
--
-- Los roles y a quién se asignan viven en Keycloak (roles del cliente
-- fix-descarte). Aquí solo se guarda, por rol, la lista de permisos del
-- portal. El rol de super administrador (KEYCLOAK_ROLE_SUPERADMIN, por
-- defecto "Administrador") tiene todos los permisos siempre y no se guarda.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'RolPermisos' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).RolPermisos (
        Rol         NVARCHAR(100)   NOT NULL,   -- nombre del rol en Keycloak
        Permiso     VARCHAR(50)     NOT NULL,   -- código, ver src/services/acceso/permisos.js
        CreatedAt   DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy   VARCHAR(150)    NULL,
        CONSTRAINT PK_RolPermisos PRIMARY KEY (Rol, Permiso)
    );
END
GO

-- Quién cambió qué en la configuración de acceso.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ConfigAuditoria' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ConfigAuditoria (
        ConfigAuditoriaId   BIGINT          IDENTITY(1,1) PRIMARY KEY,
        Accion              VARCHAR(30)     NOT NULL,   -- 'asignar_rol' | 'quitar_rol' | 'permisos_rol'
        Detalle             NVARCHAR(1000)  NOT NULL,
        Usuario             VARCHAR(150)    NOT NULL,
        Fecha               DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_ConfigAuditoria_Fecha ON $(SCHEMA).ConfigAuditoria (Fecha DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '007_roles_permisos.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('007_roles_permisos.sql');
GO
