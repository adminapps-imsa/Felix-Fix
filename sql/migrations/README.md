# Migraciones SQL — Productos Dañados

No hay ORM en este proyecto: las migraciones son scripts `.sql` numerados, cada
uno idempotente (usa `IF NOT EXISTS` antes de crear objetos) y se registra a
sí mismo en `dbo.SchemaMigrations` al terminar.

## Orden de ejecución

1. `000_create_schema_migrations.sql`
2. `001_create_tiendas.sql`
3. `002_create_reportes_producto_danado.sql`
4. `003_create_reportes_historial.sql`
5. `004_seed_tiendas.sql` (datos de EJEMPLO, reemplazar por el catálogo real)
6. `005_create_reclamos.sql` — módulo Reclamos: `Reclamos`, `ReclamoLineas` y
   `ProveedorRelaciones` (esta última se crea VACÍA: cargar el catálogo
   proveedor → mundo/departamento/marca para que el formulario los autocomplete)
7. `006_reclamos_division_motivo.sql` — División y Motivo de reclamos, con su
   catálogo `ReclamoCatalogos` (crece cuando alguien escribe un valor nuevo), e
   índices para el listado y el KPI de productos por decidir
8. `007_roles_permisos.sql` — permisos por rol (Configuración) y su historial
9. `008_productos_danados_division_correos.sql` — Productos Dañados: SKU
   opcional, División y Motivo con catálogo (`motivo_producto`), correos de
   proveedor y adjuntos PDF/Excel por reporte
10. `009_productos_danados_envio_proveedor.sql` — Productos Dañados: cuándo,
   quién y cuántas veces se envió el reporte al proveedor por correo
11. `010_productos_danados_flujo_gof_contabilidad.sql` — Productos Dañados:
   estados `EnContabilidad` y `Cerrado`, `Resolucion` (Devolucion/NF) y
   `PagoReferencia` para el flujo NF → supervisor GOF y Devolución aprobada →
   Gof → Contabilidad → Cerrado
12. `012_reclamos_documentos_contabilidad.sql` — Reclamos: bandeja de
   contabilidad. `ReclamoDocumentosContabilidad` guarda, por cada PDF adjunto
   (nota de débito de SAP) de un reclamo enviado a contabilidad, los datos
   leídos del PDF y su cruce con los productos del reclamo (estado `pendiente`)

## Esquemas QA y Prod

Las tablas viven en un esquema por ambiente dentro de `FelixVoid`: `QA` y
`Prod`. Los scripts usan el marcador `$(SCHEMA)` en lugar de un esquema fijo,
y el backend lee el esquema activo de `DB_SCHEMA` en `.env` (hoy `QA`).

```bash
npm run migrate -- QA     # crea el esquema si no existe y corre 000..NNN
npm run migrate -- Prod
```

También se pueden correr a mano con `sqlcmd -v SCHEMA=QA -i <archivo>.sql`.
Cada script se puede volver a correr sin duplicar datos ni objetos.

Para pasar el portal a producción: `DB_SCHEMA=Prod` en `.env` y reiniciar
`api-factura.service`. Las tablas antiguas en `dbo` quedaron sin usar.

## Pendiente de decisión del cliente

- Catálogo real de tiendas (reemplazar `004_seed_tiendas.sql`).
- Convención de nombres de tabla/columna: se usó PascalCase estándar de SQL
  Server por no existir una convención previa en el portal; ajustar si el
  resto de la base de datos usa otro estilo.
