-- Reclamos que quedaron «pendiente» con todos sus productos aprobados por el
-- sistema (REC-000003, 2026-11-19: diferencias devuelto antes de la 030; al
-- reenviarlo volvió a pendiente y salía esperando a la compradora sin nada que
-- decidir). Desde este cambio, al reenviar se cierra solo
-- (estadoAlReenviar en src/domain/reclamo.js). Aquí se cierran los que ya
-- quedaron así, igual que la 030: resuelto por el sistema. No manda correos.
-- Idempotente: solo toca reclamos que siguen pendientes.

UPDATE r
SET Status = 'resuelto', DecisionBy = 'sistema', DecisionAt = SYSUTCDATETIME()
OUTPUT 'REC-' + RIGHT('000000' + CAST(inserted.ReclamoId AS VARCHAR(20)), 6) AS Cerrado
FROM $(SCHEMA).Reclamos r
WHERE r.Status = 'pendiente'
  AND EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoLineas l WHERE l.ReclamoToken = r.Token)
  AND NOT EXISTS (
    SELECT 1 FROM $(SCHEMA).ReclamoLineas l
    WHERE l.ReclamoToken = r.Token
      AND (l.DecStatus <> 'aprobado' OR l.DecBy IS NULL OR l.DecBy <> 'sistema')
  );
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '049_reclamos_pendientes_todo_automatico.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('049_reclamos_pendientes_todo_automatico.sql');
GO
