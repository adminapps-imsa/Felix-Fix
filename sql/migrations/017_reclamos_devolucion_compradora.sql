-- Reclamos: la compradora devuelve el reclamo a quien lo creó para corregirlo.
--
--   pendiente --(compradora: «Devolver» + comentario)--> devuelto
--   devuelto  --(quien lo creó: corrige y «Reenviar»)--> pendiente
--
-- Las decisiones de productos que ya tomó la compradora se conservan. Cada
-- devolución y cada reenvío quedan en ReclamoComentarios (quién, qué y cuándo).
-- Idempotente, igual que el resto de las migraciones.

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Reclamos_Status' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos')
      AND definition NOT LIKE '%devuelto%'
)
    ALTER TABLE $(SCHEMA).Reclamos DROP CONSTRAINT CK_Reclamos_Status;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Reclamos_Status' AND parent_object_id = OBJECT_ID('$(SCHEMA).Reclamos'))
    ALTER TABLE $(SCHEMA).Reclamos ADD CONSTRAINT CK_Reclamos_Status CHECK (Status IN ('pendiente', 'resuelto', 'rechazado', 'notificado', 'devuelto'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ReclamoComentarios' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).ReclamoComentarios (
        ComentarioId    BIGINT          IDENTITY(1,1) PRIMARY KEY,
        ReclamoId       BIGINT          NOT NULL,
        Tipo            VARCHAR(15)     NOT NULL,   -- 'devuelto' (compradora) | 'reenviado' (quien lo creó)
        Texto           NVARCHAR(1000)  NULL,
        Usuario         VARCHAR(150)    NOT NULL,
        Fecha           DATETIME2       NOT NULL CONSTRAINT DF_ReclamoComentarios_Fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ReclamoComentarios_Reclamo FOREIGN KEY (ReclamoId) REFERENCES $(SCHEMA).Reclamos (ReclamoId),
        CONSTRAINT CK_ReclamoComentarios_Tipo CHECK (Tipo IN ('devuelto', 'reenviado'))
    );
    CREATE INDEX IX_ReclamoComentarios_Reclamo ON $(SCHEMA).ReclamoComentarios (ReclamoId, Fecha);
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '017_reclamos_devolucion_compradora.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('017_reclamos_devolucion_compradora.sql');
GO
