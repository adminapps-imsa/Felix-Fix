-- Reclamos: el supervisor GOF también devuelve el reclamo a quien lo creó
-- (pedido del 2026-11-06), en cualquier estado mientras no se haya enviado a
-- contabilidad. Al reenviarlo vuelve al estado que tenía:
--
--   pendiente | notificado | resuelto | rechazado
--        --(supervisor GOF: «Devolver al creador» + motivo)--> devuelto
--   devuelto --(quien lo creó: corrige y «Reenviar»)--------> el estado de antes
--
-- Si quien lo creó cambió productos de un reclamo ya cerrado, esos productos
-- quedan por decidir y el reclamo vuelve a «pendiente» (src/domain/reclamo.js:
-- estadoAlReenviar).
--   StatusAntesDevolucion  estado que tenía al devolverlo (NULL = pendiente, como antes)
--   DevueltoPor            'compradora' | 'supervisor_gof' (NULL = compradora, como antes)
--
-- Permiso nuevo «reclamos.devolver_supervisor»: se da a los roles que ya
-- validan los NF de Productos Dañados («Validar NF», el supervisor GOF). Se
-- puede quitar o dar a otro rol desde Configuración.
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).Reclamos', 'StatusAntesDevolucion') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD StatusAntesDevolucion VARCHAR(15) NULL;
GO
IF COL_LENGTH('$(SCHEMA).Reclamos', 'DevueltoPor') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD DevueltoPor VARCHAR(20) NULL;
GO

INSERT INTO $(SCHEMA).RolPermisos (Rol, Permiso, CreatedBy)
SELECT DISTINCT rp.Rol, 'reclamos.devolver_supervisor', 'migracion-027'
FROM $(SCHEMA).RolPermisos rp
WHERE rp.Permiso = 'productos_danados.nf'
  AND NOT EXISTS (SELECT 1 FROM $(SCHEMA).RolPermisos x WHERE x.Rol = rp.Rol AND x.Permiso = 'reclamos.devolver_supervisor');
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '027_reclamos_devolucion_supervisor_gof.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('027_reclamos_devolucion_supervisor_gof.sql');
GO
