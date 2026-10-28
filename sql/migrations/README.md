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
13. `011_reclamos_envio_contabilidad.sql` — Reclamos: cuándo, quién y a quién
   se envió el reclamo cerrado a contabilidad (`EnviadoContabilidad*`)
14. `013_productos_danados_nf_documento_1700.sql` — Productos Dañados: estado
   `NFValidacion` (Gof marca el documento 1700 antes del supervisor GOF)
15. `014_productos_danados_documento_salida_nf.sql` — Productos Dañados:
   «Documento salida de NF» que escribe el supervisor GOF (`DocumentoSalidaNf`)
16. `015_divisiones_perfumeria_cosmeticos.sql` — División: solo Perfumería y
   Cosméticos activas en el catálogo; las demás quedan inactivas (los casos
   viejos conservan la suya). Los formularios ya no agregan divisiones nuevas.
17. `016_reclamos_fecha_llegada_mercancia.sql` — Reclamos: fecha de llegada
   de la mercancía, obligatoria al crear (Tienda y CEDI); NULL en los viejos
18. `017_reclamos_devolucion_compradora.sql` — Reclamos: estado `devuelto` y
   tabla `ReclamoComentarios` (la compradora devuelve a quien lo creó y este lo reenvía)
19. `018_reclamos_devolucion_retiro_proveedor.sql` — Reclamos: tipo `devolucion`
   y la marca del retiro del proveedor (`RetiroProveedor*`: día, foto, quién)
20. `019_productos_danados_devolver_tienda.sql` — Productos Dañados: estado
   `Devuelto` (la compradora lo devuelve a la tienda antes de enviarlo al
   proveedor) y las acciones de historial `DevueltoTienda` y `Corregido`
21. `020_compradora_usuarios.sql` — `CompradoraUsuarios`: qué usuario del portal
   es cada compradora del catálogo de FelixApproval (8 emparejadas), para que
   cada una vea solo los casos de sus mundos y marcas
22. `021_compradora_ve_todo.sql` — `CompradoraUsuarios.VeTodo`: compradoras que
   por ahora ven todo (Alma Batista, Karina Samuels, Ana Gabriela López)
23. `022_productos_danados_solo_propios.sql` — permiso de restricción
   `productos_danados.solo_propios` («Solo los reportes que creó») para el rol
   Tienda: cada usuario de tienda ve solo los reportes que creó. Solo agrega esa
   fila en `RolPermisos`; no toca los demás permisos.
24. `023_rol_vista.sql` — rol `Vista` (solo ver): «Ver reportes» y «Ver
   reclamos». Solo si el rol aún no tiene permisos guardados.

## Esquemas QA y Prod

Las tablas viven en un esquema por ambiente dentro de `FelixVoid`: `QA` y
`Prod`. Los scripts usan el marcador `$(SCHEMA)` en lugar de un esquema fijo,
y el backend lee el esquema activo de `DB_SCHEMA` en `.env` (hoy `QA`).

```bash
npm run migrate -- QA     # crea el esquema si no existe y corre las que faltan
npm run migrate -- Prod
npm run migrate -- QA --todas   # vuelve a correr todas, también las ya aplicadas
```

`migrate.js` salta las que ya están en `SchemaMigrations` de ese esquema (así
un cambio hecho a mano después, p. ej. reactivar una división, no se pisa).
También se pueden correr a mano con `sqlcmd -v SCHEMA=QA -i <archivo>.sql`.
Cada script se puede volver a correr sin duplicar datos ni objetos.

**Estado (2026-10-20):** QA tiene 000–018. En Prod faltan 010 a 018 (Prod solo tiene 000–009):
correrlas antes de pasar el portal a `DB_SCHEMA=Prod`.

Para pasar el portal a producción: `DB_SCHEMA=Prod` en `.env` y reiniciar
`api-factura.service`. Las tablas antiguas en `dbo` quedaron sin usar.

## Pendiente de decisión del cliente

- Catálogo real de tiendas (reemplazar `004_seed_tiendas.sql`).
- Convención de nombres de tabla/columna: se usó PascalCase estándar de SQL
  Server por no existir una convención previa en el portal; ajustar si el
  resto de la base de datos usa otro estilo.
