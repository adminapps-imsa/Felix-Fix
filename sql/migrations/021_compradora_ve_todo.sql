-- Compradoras que por ahora ven todos los casos (no solo sus mundos y marcas).
-- Igual reciben avisos solo de los casos que tienen asignados
-- (src/services/acceso/alcanceCompradora.js).
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).CompradoraUsuarios', 'VeTodo') IS NULL
    ALTER TABLE $(SCHEMA).CompradoraUsuarios ADD VeTodo BIT NOT NULL CONSTRAINT DF_CompradoraUsuarios_VeTodo DEFAULT 0;
GO

-- Pedido del 2026-10-21: Alma Batista, Karina Samuels y Ana Gabriela López ven todo por ahora.
-- (Rosa Saavedra no está en el catálogo: ya ve todo.)
UPDATE $(SCHEMA).CompradoraUsuarios SET VeTodo = 1 WHERE Username IN ('abatista', 'ksamuels', 'anlopez') AND VeTodo = 0;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '021_compradora_ve_todo.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('021_compradora_ve_todo.sql');
GO
