-- Reclamos: cierre automático (pedido del 2026-11-09). Desde este cambio, un
-- reclamo cuyos productos se aprueban TODOS solos (p. ej. solo faltante real)
-- nace 'resuelto' con DecisionBy = 'sistema' (src/domain/reclamo.js:
-- estadoAlCrear). Esta migración cierra igual los que ya estaban 'pendiente'
-- en esa situación: todos sus productos aprobados por el sistema, ninguno
-- decidido por una persona. No manda correos.
-- Idempotente: solo toca los que siguen 'pendiente'.

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

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '029_reclamos_cierre_automatico.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('029_reclamos_cierre_automatico.sql');
GO
