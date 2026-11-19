-- Torre de Control edita un reclamo de CEDI ya creado si subió o escribió algo
-- mal (pedido del 2026-11-19). Permiso nuevo «reclamos.editar_cedi»: en el
-- detalle aparece «Editar reclamo»; el reclamo queda en edición y al guardar
-- vuelve a su estado (src/services/reclamos/devolucion.js abrirEdicion).
-- Se puede quitar o dar a otro rol desde Configuración. Idempotente.

IF EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos WHERE Rol = N'Torre de Control')
   AND NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos WHERE Rol = N'Torre de Control' AND Permiso = 'reclamos.editar_cedi')
    INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy) VALUES (N'Torre de Control', 'reclamos.editar_cedi', 'migracion-048');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '048_torre_control_editar_cedi.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('048_torre_control_editar_cedi.sql');
GO
