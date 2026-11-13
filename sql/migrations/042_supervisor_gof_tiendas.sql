-- El supervisor GOF pone a los de Gof en su tienda (pedido del 2026-11-13),
-- sin ser administrador. Permiso nuevo «usuarios.tiendas»: entra a
-- Configuración → Tiendas y ve y cambia solo a las personas con rol Gof
-- (src/services/acceso/configuracionService.js). Se da a los roles que validan
-- los NF («Validar NF», el supervisor GOF), como la 027. Se puede quitar o dar
-- a otro rol desde Configuración. Idempotente.

INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy)
SELECT DISTINCT rp.Rol, 'usuarios.tiendas', 'migracion-042'
FROM $(SCHEMA).RolPermisos rp
WHERE rp.Permiso = 'productos_danados.nf'
  AND NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos x WHERE x.Rol = rp.Rol AND x.Permiso = 'usuarios.tiendas');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '042_supervisor_gof_tiendas.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('042_supervisor_gof_tiendas.sql');
GO
