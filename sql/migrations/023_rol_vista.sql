-- Rol «Vista» (pedido del 2026-10-28): solo ve los datos, no modifica nada.
-- El rol se crea en Keycloak (cliente fix-descarte); aquí solo sus permisos:
-- «Ver reportes» y «Ver reclamos». Ninguna ruta que modifica acepta estos
-- permisos y ningún aviso por correo va a quien solo los tiene.
-- Solo se cargan si el rol aún no tiene permisos guardados: no pisa lo que se
-- haya marcado en Configuración. Se pueden cambiar desde ahí.
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos WHERE Rol = N'Vista')
    INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy) VALUES
        (N'Vista', 'productos_danados.ver', 'migracion-023'),
        (N'Vista', 'reclamos.ver', 'migracion-023');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '023_rol_vista.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('023_rol_vista.sql');
GO
