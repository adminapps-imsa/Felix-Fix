-- Reclamos: datos del artículo que llena la compradora al aprobar un
-- sobrante no esperado que no está en SAP (pedido del 2026-11-12). Van a
-- Data en el correo, junto con lo de la hoja del Excel, para crear el
-- artículo: costo, precio de venta, categoría, tipo de producto, ciclo de
-- vida, descripción y marca. No cambia datos existentes. Idempotente.

IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtCosto') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtCosto DECIMAL(18,2) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtPrecioVenta') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtPrecioVenta DECIMAL(18,2) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtCategoria') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtCategoria NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtTipoProducto') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtTipoProducto NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtCicloVida') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtCicloVida NVARCHAR(100) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtDescripcion') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtDescripcion NVARCHAR(300) NULL;
IF COL_LENGTH('$(SCHEMA).ReclamoLineas', 'ArtMarca') IS NULL
    ALTER TABLE $(SCHEMA).ReclamoLineas ADD ArtMarca NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '032_reclamos_datos_articulo_data.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('032_reclamos_datos_articulo_data.sql');
GO
