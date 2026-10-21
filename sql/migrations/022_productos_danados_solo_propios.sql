-- Tienda ve solo los reportes de Productos Dañados que creó (pedido del 2026-10-21).
-- Permiso de restricción «Solo los reportes que creó» (productos_danados.solo_propios):
-- filtra lista, tarjetas, Tablero y detalle (src/domain/productoDanado.js: creadorVisible).
-- Solo agrega el permiso al rol Tienda: no toca los demás permisos ya configurados.
-- Se puede quitar o dar a otro rol desde Configuración.
-- Idempotente, igual que el resto de las migraciones.

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos WHERE Rol = N'Tienda' AND Permiso = 'productos_danados.solo_propios')
    INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy) VALUES (N'Tienda', 'productos_danados.solo_propios', 'migracion-022');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '022_productos_danados_solo_propios.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('022_productos_danados_solo_propios.sql');
GO
