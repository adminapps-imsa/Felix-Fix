-- Bitácora del portal (Configuración → Bitácora, pedido del 2026-11-13).
--
-- Una fila por cosa que pasa: lo que la gente hace (Clase 'actividad') y lo
-- que sale mal (Clase 'error': Nivel 'aviso' = el portal rechazó algo del
-- usuario, 4xx; 'falla' = el portal o un servicio falló). La escribe
-- src/services/bitacora/registro.js; las reglas están en src/domain/bitacora.js.
-- No guarda el contenido de lo enviado (archivos, textos), solo qué fue, quién
-- y el mensaje del resultado. Se borra lo de más de 180 días.
-- Idempotente.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Bitacora' AND schema_id = SCHEMA_ID('$(SCHEMA)'))
BEGIN
    CREATE TABLE $(SCHEMA).Bitacora (
        BitacoraId      BIGINT          IDENTITY(1,1) NOT NULL CONSTRAINT PK_Bitacora PRIMARY KEY,
        Fecha           DATETIME2       NOT NULL CONSTRAINT DF_Bitacora_Fecha DEFAULT SYSUTCDATETIME(),
        Clase           VARCHAR(10)     NOT NULL,           -- actividad | error
        Nivel           VARCHAR(10)     NOT NULL,           -- info | aviso | falla
        Modulo          VARCHAR(30)     NOT NULL,           -- reclamos | productos_danados | configuracion | sesion | sistema…
        Accion          NVARCHAR(200)   NOT NULL,           -- «Creó un reclamo», «SAP no disponible…»
        Mensaje         NVARCHAR(2000)  NULL,               -- mensaje del error (o del resultado)
        Codigo          VARCHAR(60)     NULL,               -- código del error (PLANTILLA_INCOMPLETA…)
        Usuario         VARCHAR(150)    NULL,
        UsuarioNombre   NVARCHAR(200)   NULL,
        Roles           NVARCHAR(500)   NULL,               -- «,Compradora,Gof,» (con comas a los lados para filtrar exacto)
        Metodo          VARCHAR(10)     NULL,
        Ruta            NVARCHAR(400)   NULL,
        Estado          INT             NULL,               -- código HTTP
        DuracionMs      INT             NULL,
        RecursoTipo     VARCHAR(20)     NULL,               -- reclamo | reporte
        RecursoId       VARCHAR(64)     NULL                -- token del reclamo o id del reporte
    );
    CREATE INDEX IX_Bitacora_Clase_Fecha ON $(SCHEMA).Bitacora (Clase, Fecha DESC);
    CREATE INDEX IX_Bitacora_Usuario_Fecha ON $(SCHEMA).Bitacora (Usuario, Fecha DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM $(SCHEMA).SchemaMigrations WHERE Nombre = '040_bitacora.sql')
    INSERT INTO $(SCHEMA).SchemaMigrations (Nombre) VALUES ('040_bitacora.sql');
GO
