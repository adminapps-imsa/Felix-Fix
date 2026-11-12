-- Torre de Control solo crea reclamos de CEDI (pedido del 2026-11-12): se le
-- da la restricción «Solo reclamos de CEDI» (reclamos.solo_cedi), igual que
-- Gof tiene «Solo reclamos de Tienda». Se puede quitar desde Configuración.
-- Idempotente: si ya la tiene, no hace nada.

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos WHERE Rol = N'Torre de Control' AND Permiso = 'reclamos.solo_cedi')
    INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy) VALUES (N'Torre de Control', 'reclamos.solo_cedi', 'migracion-033');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '033_torre_control_solo_cedi.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('033_torre_control_solo_cedi.sql');
GO
