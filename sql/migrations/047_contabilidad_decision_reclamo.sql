-- Contabilidad decide si el documento se le reclama al proveedor (pedido del
-- 2026-11-18), antes de enviarlo y de registrar su respuesta:
--   'reclamar'     se habilitan «Enviar al proveedor» y «Respuesta del proveedor»;
--                  el documento sigue 'pendiente' hasta la respuesta.
--   'no_reclamar'  con un motivo; el documento queda 'no_reclamado' (cerrado).
-- Los que ya se enviaron al proveedor o ya tienen respuesta quedan como 'reclamar'.
-- Idempotente.

IF COL_LENGTH('$(SCHEMA).ReclamoDocumentosContabilidad', 'DecisionConta') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD
        DecisionConta NVARCHAR(20) NULL,
        DecisionContaAt DATETIME2 NULL,
        DecisionContaPor NVARCHAR(150) NULL,
        DecisionContaComentario NVARCHAR(2000) NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad')
           AND definition NOT LIKE '%no_reclamado%')
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad DROP CONSTRAINT CK_ReclamoDocsConta_Estado;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Estado' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad'))
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD CONSTRAINT CK_ReclamoDocsConta_Estado CHECK (Estado IN ('pendiente', 'aprobado', 'no_aprobado', 'no_reclamado'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ReclamoDocsConta_Decision' AND parent_object_id = OBJECT_ID('$(SCHEMA).ReclamoDocumentosContabilidad'))
    ALTER TABLE $(SCHEMA).ReclamoDocumentosContabilidad ADD CONSTRAINT CK_ReclamoDocsConta_Decision CHECK (DecisionConta IS NULL OR DecisionConta IN ('reclamar', 'no_reclamar'));
GO

UPDATE $(SCHEMA).ReclamoDocumentosContabilidad
   SET DecisionConta = 'reclamar', DecisionContaAt = COALESCE(EnviadoProveedorAt, RespuestaAt), DecisionContaPor = COALESCE(EnviadoProveedorPor, RespuestaPor)
 WHERE DecisionConta IS NULL AND (EnviadoProveedorAt IS NOT NULL OR Estado IN ('aprobado', 'no_aprobado'));
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '047_contabilidad_decision_reclamo.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('047_contabilidad_decision_reclamo.sql');
GO
