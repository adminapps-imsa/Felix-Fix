-- Permisos por rol para el esquema Prod, copiados de QA el 2026-10-21.
-- No es una migración: es la configuración que se hace en Configuración del
-- portal, cargada de una vez. Se corre UNA vez, a mano, después de migrar Prod:
--   sqlcmd -S 172.27.10.45 -d FelixVoid -U <usuario> -i deploy/prod/permisos_roles_prod.sql
-- Solo agrega lo que falta (no borra ni duplica), así que se puede repetir.
-- productos_danados.solo_propios (Tienda) solo hace efecto con el código de la
-- migración 022, que todavía no está en este servidor.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @permisos TABLE (Rol NVARCHAR(100) NOT NULL, Permiso VARCHAR(100) NOT NULL);
INSERT INTO @permisos (Rol, Permiso) VALUES
    (N'Compradora', 'productos_danados.aprobar'),
    (N'Compradora', 'productos_danados.enviar'),
    (N'Compradora', 'productos_danados.ver'),
    (N'Compradora', 'reclamos.decidir'),
    (N'Compradora', 'reclamos.ver'),
    (N'Contabilidad', 'productos_danados.pago'),
    (N'Contabilidad', 'reclamos.contabilidad'),
    (N'Gof', 'productos_danados.documentar'),
    (N'Gof', 'productos_danados.nf_documento'),
    (N'Gof', 'productos_danados.ver'),
    (N'Gof', 'productos_danados.ver_nf'),
    (N'Gof', 'reclamos.adjuntar'),
    (N'Gof', 'reclamos.crear'),
    (N'Gof', 'reclamos.enviar_contabilidad'),
    (N'Gof', 'reclamos.retiro_proveedor'),
    (N'Gof', 'reclamos.solo_tienda'),
    (N'Gof', 'reclamos.ver'),
    (N'supervisorGof', 'productos_danados.documentar'),
    (N'supervisorGof', 'productos_danados.nf'),
    (N'supervisorGof', 'productos_danados.pago'),
    (N'supervisorGof', 'productos_danados.ver'),
    (N'supervisorGof', 'reclamos.adjuntar'),
    (N'supervisorGof', 'reclamos.enviar_contabilidad'),
    (N'supervisorGof', 'reclamos.ver'),
    (N'Tienda', 'productos_danados.crear'),
    (N'Tienda', 'productos_danados.solo_propios'),
    (N'Tienda', 'productos_danados.ver'),
    (N'Torre de Control', 'reclamos.adjuntar'),
    (N'Torre de Control', 'reclamos.crear'),
    (N'Torre de Control', 'reclamos.enviar_contabilidad'),
    (N'Torre de Control', 'reclamos.ver'),
    (N'Trafico', 'reclamos.crear'),
    (N'Trafico', 'reclamos.ver');

INSERT INTO [Prod].RolPermisos (Rol, Permiso, CreatedBy)
SELECT p.Rol, p.Permiso, 'script-paso-prod'
FROM @permisos p
WHERE NOT EXISTS (SELECT 1 FROM [Prod].RolPermisos r WHERE r.Rol = p.Rol AND r.Permiso = p.Permiso);

PRINT CONCAT('Permisos agregados: ', @@ROWCOUNT);

-- Que quede en el Historial de Configuración, como cuando se guarda desde el portal.
INSERT INTO [Prod].ConfigAuditoria (Accion, Detalle, Usuario) VALUES
    ('permisos_rol', N'Compradora: productos_danados.aprobar, productos_danados.enviar, productos_danados.ver, reclamos.decidir, reclamos.ver', 'script-paso-prod'),
    ('permisos_rol', N'Contabilidad: productos_danados.pago, reclamos.contabilidad', 'script-paso-prod'),
    ('permisos_rol', N'Gof: productos_danados.documentar, productos_danados.nf_documento, productos_danados.ver, productos_danados.ver_nf, reclamos.adjuntar, reclamos.crear, reclamos.enviar_contabilidad, reclamos.retiro_proveedor, reclamos.solo_tienda, reclamos.ver', 'script-paso-prod'),
    ('permisos_rol', N'supervisorGof: productos_danados.documentar, productos_danados.nf, productos_danados.pago, productos_danados.ver, reclamos.adjuntar, reclamos.enviar_contabilidad, reclamos.ver', 'script-paso-prod'),
    ('permisos_rol', N'Tienda: productos_danados.crear, productos_danados.solo_propios, productos_danados.ver', 'script-paso-prod'),
    ('permisos_rol', N'Torre de Control: reclamos.adjuntar, reclamos.crear, reclamos.enviar_contabilidad, reclamos.ver', 'script-paso-prod'),
    ('permisos_rol', N'Trafico: reclamos.crear, reclamos.ver', 'script-paso-prod');

COMMIT;

-- Revisión: debe dar 33 permisos en 7 roles.
SELECT Rol, COUNT(*) AS Permisos FROM [Prod].RolPermisos GROUP BY Rol ORDER BY Rol;
