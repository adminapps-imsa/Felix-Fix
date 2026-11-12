-- Reclamos: la compradora solo decide los SOBRANTES (pedido del 2026-11-12).
-- Desde este cambio, los productos de Devolución y Diferencias se aprueban
-- solos al crearse, igual que faltante y daños (src/services/reclamos/tipos.js:
-- TIPOS_AUTO_APROBADOS). Esta migración aprueba igual los que ya estaban
-- 'pendiente' y cierra (como la 029) los reclamos 'pendiente' que quedan con
-- todos sus productos aprobados por el sistema. No manda correos.
-- El 912 ahora solo se pide con sobrantes aprobados: eso es código, no datos.
-- Idempotente: solo toca productos y reclamos que siguen pendientes.

UPDATE l
SET DecStatus = 'aprobado',
    DecComentario = N'Aprobado automáticamente — este tipo de reclamo no requiere revisión manual.',
    DecAt = SYSUTCDATETIME(),
    DecBy = 'sistema'
FROM $(SCHEMA).ReclamoLineas l
JOIN $(SCHEMA).Reclamos r ON r.Token = l.ReclamoToken
WHERE l.DecStatus = 'pendiente'
  AND l.Tipo IN ('devolucion', 'diferencias')
  AND r.Status IN ('pendiente', 'devuelto', 'notificado');
GO

UPDATE r
SET Status = 'resuelto', DecisionBy = 'sistema', DecisionAt = SYSUTCDATETIME()
FROM $(SCHEMA).Reclamos r
WHERE r.Status = 'pendiente'
  AND EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoLineas l WHERE l.ReclamoToken = r.Token)
  AND NOT EXISTS (
    SELECT 1 FROM $(SCHEMA).ReclamoLineas l
    WHERE l.ReclamoToken = r.Token
      AND (l.DecStatus <> 'aprobado' OR l.DecBy IS NULL OR l.DecBy <> 'sistema')
  );
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '030_reclamos_solo_sobrante_decide.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('030_reclamos_solo_sobrante_decide.sql');
GO
