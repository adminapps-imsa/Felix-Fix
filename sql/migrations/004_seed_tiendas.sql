-- Catálogo real de tiendas entregado por el cliente.

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD04')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD04', 'Vía España', NULL);

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD15')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD15', 'Multiplaza', NULL);

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD20')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD20', 'Albrook', NULL);

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD26')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD26', 'Alta Plaza', NULL);

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD28')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD28', 'Town Center', NULL);

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).Tiendas WHERE Codigo = 'TD30')
    INSERT INTO $(SCHEMA).Tiendas (Codigo, Nombre, Direccion) VALUES ('TD30', 'Metromall', NULL);
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '004_seed_tiendas.sql')
BEGIN
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('004_seed_tiendas.sql');
END
GO
