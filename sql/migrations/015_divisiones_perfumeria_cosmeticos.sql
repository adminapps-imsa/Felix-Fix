-- División de reportes y reclamos: por ahora solo Perfumería y Cosméticos.
-- Las demás quedan inactivas (Activo = 0): no salen en los formularios y la
-- API las rechaza, pero los reportes y reclamos viejos conservan la suya.
-- Para volver a ofrecer una, se pone Activo = 1.

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = N'Perfumería')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', N'Perfumería');
IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).ReclamoCatalogos WHERE Tipo = 'division' AND Valor = N'Cosméticos')
    INSERT INTO $(SCHEMA).ReclamoCatalogos (Tipo, Valor) VALUES ('division', N'Cosméticos');
GO

UPDATE $(SCHEMA).ReclamoCatalogos SET Activo = 1 WHERE Tipo = 'division' AND Valor IN (N'Perfumería', N'Cosméticos');
UPDATE $(SCHEMA).ReclamoCatalogos SET Activo = 0 WHERE Tipo = 'division' AND Valor NOT IN (N'Perfumería', N'Cosméticos') AND Activo = 1;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '015_divisiones_perfumeria_cosmeticos.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('015_divisiones_perfumeria_cosmeticos.sql');
GO
