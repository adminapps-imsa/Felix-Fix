-- Reclamos: «¿El proveedor va a retirar el producto?» se contesta al crear
-- cualquier reclamo (no solo los de devolución). Si es Sí, el reclamo queda
-- esperando el retiro hasta que Gof marque «Entregado al proveedor» con el
-- día y la foto (columnas RetiroProveedor* de la 018).
--   RetiroProveedor  1 = lo retira el proveedor, 0 = no, NULL = creado antes
--                    de la pregunta (entonces solo las devoluciones lo llevan).
-- Las devoluciones lo llevan siempre (src/domain/reclamo.js: llevaRetiro).
-- Idempotente, igual que el resto de las migraciones.

IF COL_LENGTH('$(SCHEMA).Reclamos', 'RetiroProveedor') IS NULL
    ALTER TABLE $(SCHEMA).Reclamos ADD RetiroProveedor BIT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '025_reclamos_retiro_proveedor_todos.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('025_reclamos_retiro_proveedor_todos.sql');
GO
