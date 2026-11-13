-- Todo por rol, nada por «quien lo creó» (pedido del 2026-11-13: la Vista por
-- rol debe verse igual que los usuarios de ese rol). Cuatro permisos nuevos
-- reemplazan la regla del creador (src/services/acceso/permisos.js):
--   reclamos.corregir            Corregir reclamos devueltos
--   reclamos.adjuntar_abiertos   Adjuntar en reclamos abiertos
--   reclamos.cambiar_retiro      Cambiar si el proveedor retira
--   productos_danados.editar     Editar correos y adjuntos (reportes)
-- Para que nadie pierda lo que hacía, se le dan a los roles que hoy crean
-- casos (los que tenían «Crear reclamos» o «Crear reportes»). Después se
-- ajustan en Configuración → Roles y permisos. Idempotente.

INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy)
SELECT rp.Rol, n.Permiso, 'migracion-041'
FROM $(SCHEMA).RolPermisos rp
CROSS JOIN (VALUES ('reclamos.corregir'), ('reclamos.adjuntar_abiertos'), ('reclamos.cambiar_retiro')) n(Permiso)
WHERE rp.Permiso = 'reclamos.crear'
  AND NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos x WHERE x.Rol = rp.Rol AND x.Permiso = n.Permiso);
GO

INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy)
SELECT rp.Rol, 'productos_danados.editar', 'migracion-041'
FROM $(SCHEMA).RolPermisos rp
WHERE rp.Permiso = 'productos_danados.crear'
  AND NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos x WHERE x.Rol = rp.Rol AND x.Permiso = 'productos_danados.editar');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '041_permisos_por_rol_no_creador.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('041_permisos_por_rol_no_creador.sql');
GO
