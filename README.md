# Felix Fix — API + módulo Productos Dañados

Proyecto nuevo (no existía código previo en este repo). Backend Express +
MSSQL + OracleDB(SAP), frontend React + TypeScript + Vite + Tailwind CSS v4.

## Estructura

```
src/            backend (Express, entry point src/index.js, puerto 3001)
sql/migrations/ scripts .sql numerados para SQL Server (ver sql/migrations/README.md)
uploads/        evidencia local (fotos), gitignored
deploy/         systemd + Nginx: copia de lo instalado en /etc (ver punto 8 de «Decisiones»)
portal/         frontend Vite (build en portal/dist/, servido por Nginx)
test/           pruebas automáticas (npm test)
```

Capas del backend: `routes → controllers → services → repositories`, más
`src/domain/` con las **reglas de negocio puras** (qué se puede hacer en cada
estado de un reclamo o reporte). El dominio no importa nada de BD, HTTP,
Keycloak ni disco: cada regla devuelve `null` (se permite) o el motivo, y el
servicio lo convierte en el error HTTP. Los repositorios no deciden reglas:
reciben la del dominio (p. ej. `eliminar(id, motivoBloqueo)`) y la aplican
con la fila bloqueada. Cambiar una regla = cambiar `src/domain/` y su prueba
en `test/domain/`.

## Backend — puesta en marcha

Requiere **Node.js 22**. En el servidor está instalado aparte en
`/opt/node-22` (el `node` del sistema sigue siendo el 18 y no se usa):
`deploy/api-factura.service` arranca con `/opt/node-22/bin/node`. Para
instalar dependencias o compilar el portal, usar ese Node:
`export PATH=/opt/node-22/bin:$PATH`.

```bash
cp .env.example .env   # completar con datos reales
npm install
npm run dev             # node --watch src/index.js
npm test                # pruebas de las reglas del dominio
```

Sin `DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD` configurados, cualquier endpoint
que toque la base falla con un mensaje explícito (no crashea en silencio).
Sin `KEYCLOAK_ISSUER_URL/JWKS_URI/CLIENT_ID/CLIENT_SECRET`, las rutas protegidas responden
**503** (fail-closed) — nunca quedan abiertas sin autenticación.
`AUTH_DISABLED=true` en `.env` es una puerta de escape solo para desarrollo
local sin Keycloak levantado; nunca debe usarse en producción.

## Frontend — puesta en marcha

```bash
cd portal
cp .env.example .env    # completar VITE_KEYCLOAK_*
npm install
npm run dev              # proxy /api -> http://localhost:3001
```

## Base de datos

Ver `sql/migrations/README.md`. Ejecutar los scripts en orden (000 a 018)
contra la base de datos del portal (`node sql/migrate.js`).

## Decisiones tomadas sin información completa (revisar)

1. **Convención de nombres SQL**: PascalCase estándar de SQL Server, por no
   existir una convención previa en el portal.
2. **Estado transitorio `EnProceso`**: no pedido explícitamente; existe solo
   para evitar condiciones de carrera en la transición Aprobado → Procesado
   (ver `src/services/productosDanadosService.js`).
3. **Evidencia (fotos)**: implementada con disco local por defecto
   (`EVIDENCE_STORAGE_PROVIDER=local`), detrás de una abstracción en
   `src/services/evidenceStorage/`. Con `EVIDENCE_STORAGE_PROVIDER=paperless`
   las fotos nuevas van a Paperless-ngx (`PAPERLESS_URL`, `PAPERLESS_TOKEN`,
   ver `.env.example`); si Paperless falla, la foto queda en disco. Cada
   reporte guarda dónde está su foto, así que las de disco se siguen viendo.
   Los PDF (reclamos y adjuntos de Productos Dañados) se quedan en disco y
   además se copian a Paperless en segundo plano (`evidenceStorage/copiasPdf.js`).
4. **Keycloak**: variables de entorno vacías (`.env.example` y
   `portal/.env.example`); roles esperados nombrados
   `productos-danados:crear/aprobar/procesar` — confirmar cómo están
   modelados los roles/claims en tu realm real.
5. **Catálogo de tiendas**: `sql/migrations/004_seed_tiendas.sql` trae solo
   3 filas de ejemplo. La base del portal ya tiene 6 tiendas (TD04 Vía España,
   TD15 Multiplaza, TD20 Albrook, TD26 Alta Plaza, TD28 Town Center,
   TD30 Metromall); confirmar si falta alguna.
6. **Visibilidad entre tiendas**: quien tiene el permiso de restricción
   «Solo los reportes que creó» (`productos_danados.solo_propios`, rol Tienda
   desde la migración `022`) ve solo los reportes que creó él mismo: lista,
   tarjetas, Inicio, Tablero y detalle (los de otros responden 404). Los demás
   roles ven todos (las compradoras, según su alcance).
7. **Integración SAP — PENDIENTE DE DEFINIR CONTIGO**:
   `src/services/sapBajaService.js` expone `darDeBajaInventario()`, hoy
   lanza `SapNoImplementadoError` de forma controlada. Falta que confirmes:
   - ¿Tabla de staging que consume un job/n8n, o RFC/BAPI directo?
   - Si es tabla de staging: nombre, esquema y columnas esperadas.
   - Código de movimiento de inventario por motivo (Deterioro, Dano,
     Vencimiento, CambioDevolucion).
   - Un usuario o mecanismo con permiso de escritura: la conexión Oracle ya
     está (`DB_SAP_*`), pero `SAPQRY` es de solo lectura.
   - Cómo detectar que una baja ya se registró en SAP, para que los
     reintentos (`idempotencyKey` ya está en el contrato de la función) no
     dupliquen el movimiento.
8. **Infraestructura**: la API corre como `api-factura.service` (systemd) y
   Nginx sirve `portal/dist/` en https://fix.felixpa.com
   (`/etc/nginx/sites-enabled/felix-portal.conf`). Los archivos de `deploy/`
   son la referencia de esa instalación.
   - Cambios en el backend → `systemctl restart api-factura.service`.
   - Cambios en el frontend → `cd portal && npx vite build` (con Node 22).
9. **Correo**: falta el buzón del portal (MAIL_* vacíos en `.env`). Sin él no
   sale ni el correo al proveedor ni los avisos internos; el portal lo indica
   en vez de fallar.

## Cada compradora ve sus mundos y marcas

`src/services/acceso/alcanceCompradora.js` (migración `020`). La compradora que
está en `CompradoraUsuarios` (usuario → nombre en el catálogo de FelixApproval
`compradoras_proveedores`) solo ve, en listas, KPIs, Inicio, Tablero, detalle y
acciones, y solo recibe avisos de:

- **Reclamos:** los que la tienen como «Compradora», o cuyo mundo y marca son
  suyos en el catálogo (si el mundo es solo de ella, cualquier marca).
- **Productos Dañados:** los de sus marcas en el catálogo. Si la marca no está,
  van a la compradora principal de Belleza (la de más filas de ese mundo).

Quien no está en la tabla o tiene `VeTodo = 1` (migración `021`: hoy Alma
Batista, Karina Samuels y Ana Gabriela López), otros roles, el super
administrador o una compradora que no está en el catálogo (Rosa Saavedra) ven
todo, como antes. Un caso fuera de su alcance responde 404 (`router.param` en
las rutas de Reclamos y Productos Dañados).

**Avisos a compradoras** (permisos `productos_danados.enviar` y
`reclamos.decidir`): llegan **solo a la compradora asignada**, vea todo o no.
En Reclamos es la elegida en «Compradora»; en Productos Dañados, la dueña de
la marca en el catálogo (o la principal de Belleza). Si no hay ninguna en el
portal, no sale el aviso.

## Productos Dañados — flujo y avisos

Pendiente → (compradora envía al proveedor) → **NF**: Gof marca el check
«Documento 1700» → **NF por validar**: el supervisor GOF escribe el
«Documento salida de NF» (obligatorio), valida y cierra; o **Devolución
aprobada**: Gof sube el documento → Contabilidad registra el pago → Cerrado
(migraciones `013` y `014`).

**Devolver a la tienda** (migración `019`): si la tienda llenó mal el
formulario, la compradora (`productos_danados.enviar` o `.aprobar`) pulsa
«Devolver a la tienda» con un comentario obligatorio, solo mientras el reporte
está Pendiente y **antes de enviarlo al proveedor** (`motivoNoDevolverATienda`).
El reporte queda **Devuelto** y le llega un correo a quien lo creó. Lo corrige
quien lo creó o cualquier usuario con «Crear reportes» (los usuarios no están
ligados a una tienda): «Corregir y reenviar» abre el mismo formulario del alta
con los datos cargados (todo se puede cambiar, también la tienda y la foto) y
una respuesta opcional (`PUT /:id/corregir`). Vuelve a Pendiente, el historial
guarda qué campos cambió y la compradora recibe un aviso.

**Validación del «Documento salida de NF»** (`validarDocumentoSalidaNf` en
`src/domain/productoDanado.js`, SAP solo lectura): 10 dígitos; existe en SAP
(MSEG); es la salida del Almacén NF (movimiento **551** desde el almacén
**1700**, que en cada tienda se llama «Almacén NF»); trae el material del
código de barras del reporte en la tienda del reporte; y no se usó ya para
cerrar otro reporte del mismo producto (un documento 551 trae varios
productos, así que sí sirve para cerrar los demás). Si SAP no responde, no
deja cerrar (503). Los permisos de cada paso se
asignan por rol en Configuración.

**Gof ve solo lo suyo**: el permiso «Ver solo NF y devoluciones»
(`productos_danados.ver_nf`) sin «Ver reportes» filtra lista, KPIs y detalle a
los NF y, si el rol también tiene «Documento para contabilidad»
(`productos_danados.documentar`), a las devoluciones aprobadas (en cualquier
etapa). Los pendientes de la compradora no. Con «Ver reportes» ve todos.

**Avisos por correo a cada área** (`src/services/correo/avisosProductosDanados.js`):
cuando un reporte llega a una etapa se avisa a los usuarios cuyos roles tienen
el permiso de esa etapa:

| Etapa | Permiso que recibe el aviso |
|---|---|
| Reporte nuevo (Pendiente) | `productos_danados.enviar` |
| NF (falta el documento 1700) | `productos_danados.nf_documento` |
| NF por validar | `productos_danados.nf` |
| Devolución aprobada | `productos_danados.documentar` |
| En contabilidad | `productos_danados.pago` |

El super administrador no los recibe. Usuarios sin correo en Keycloak se
omiten. Un aviso nunca bloquea ni hace fallar la acción. Se apagan con
`MAIL_AVISOS=false`; el enlace usa `PORTAL_URL` (por defecto, `CORS_ORIGIN`).

## Módulo Reclamos

Faltante / sobrante / diferencias / daños, creado a partir de las plantillas
Excel "Tienda" y "CEDI". Backend en `src/routes/reclamos.routes.js` →
`src/services/reclamosService.js` (+ `src/services/reclamos/`), frontend en
`portal/src/features/reclamos/`. Migración: `sql/migrations/005_create_reclamos.sql`.

- **Acceso**: por permisos del rol, asignados en Configuración → Roles y
  permisos (`reclamos.ver`, `crear`, `decidir`, `eliminar`…; tabla
  `RolPermisos`). El rol de super administrador (`KEYCLOAK_ROLE_SUPERADMIN`,
  por defecto «Administrador») los tiene todos.
- **Auto-aprobado por producto**: faltante_real y cualquier daño se aprueban
  al crear y no se pueden decidir a mano (409). Sobrante/diferencias sí.
- **Adjuntos**: quien creó el reclamo (en los suyos), quien decide, o quien
  tiene `reclamos.adjuntar` (Torre de Control) en cualquier reclamo.
- **Solo Tienda** (`reclamos.solo_tienda`, rol Gof): el formulario solo
  ofrece Tienda y el backend rechaza crear un reclamo CEDI (`SOLO_TIENDA`).
  El super administrador no lleva este permiso (`RESTRICCIONES`).
- **Envío a contabilidad**: con el reclamo cerrado (resuelto/rechazado), quien
  decide lo envía por correo a los usuarios con `reclamos.contabilidad`:
  datos, decisión, productos y todos los archivos, nombrados
  "Reclamo REC-xxxxxx - …" (migración `011`).
- **Rol `Trafico`**: retirado, lo reemplazó "Torre de Control". Sigue en
  Keycloak pero el portal lo ignora (`ROLES_RETIRADOS` en
  `src/services/acceso/keycloakAdmin.js`): no sale en Configuración ni en
  "Vista por" y no da permisos.
- **Un documento SAP pertenece a un solo reclamo.** No se crea un reclamo con
  un documento que ya está en otro (formulario o PDF adjuntos; `0004904…` y
  `4904…` cuentan como el mismo) ni con el mismo documento dos veces. El
  formulario avisa en vivo (`GET /api/reclamos/documentos-sap`) y la API lo
  vuelve a revisar dentro de la transacción del alta (`sp_getapplock`), así
  dos altas a la vez no se cuelan. En el detalle no se adjunta el mismo
  archivo dos veces (por contenido) ni un PDF de un documento de otro
  reclamo; si se vuelve a subir un PDF que ya estaba sin validar y ahora
  coincide con lo aprobado, se valida el existente en vez de duplicarlo.
- **Fecha de llegada de la mercancía obligatoria** (Tienda y CEDI, migración
  `016`): una fecha real y no posterior a hoy (`motivoFechaLlegadaInvalida`).
  Se escribe a mano (no sale del Excel); los reclamos viejos no la tienen.
- **Devolver a quien lo creó** (migración `017`, `src/services/reclamos/devolucion.js`):
  si algo está mal, la compradora (`reclamos.decidir`) pulsa «Devolver» con un
  comentario obligatorio. El reclamo pasa a `devuelto` («Con comentario de
  compradora») y no se decide hasta que vuelva. Quien lo creó (o el super
  administrador) corrige los datos y los documentos SAP (`PATCH /:token/datos`;
  el origen, el tipo y los productos no cambian), sube o quita PDF en Adjuntos y
  pulsa «Reenviar» (`POST /:token/reenviar`): vuelve a `pendiente` si cada
  documento SAP tiene su PDF y no queda el PDF de uno que se quitó
  (`motivoNoReenviar`). Las decisiones de productos ya tomadas se conservan.
  Cada devolución y reenvío queda en `ReclamoComentarios` y avisa por correo:
  a quien lo creó al devolver y a la compradora que lo devolvió al reenviar.
- **Avisos por correo de Reclamos** (`src/services/correo/avisosReclamos.js`,
  nunca bloquean): reclamo **nuevo** pendiente → `reclamos.decidir`;
  **devuelto** → quien lo creó; **reenviado** → la compradora que lo devolvió;
  **cerrado** (confirmado o rechazado) → `reclamos.enviar_contabilidad` y quien
  lo creó. Todos los correos del portal usan el diseño común de
  `src/services/correo/diseno.js` (franja índigo, fondo blanco, solo colores
  del portal) y `destinatarios.js` para saber a quién avisar.
- **Devolución al proveedor** (tipo `devolucion`, migración `018`): el Excel
  reconoce el motivo «DEVOLUCIÓN» (`detectarTipoPorMotivo`); la compradora
  decide sus productos como en sobrante/diferencias. En esos reclamos Gof
  (permiso `reclamos.retiro_proveedor`, asignarlo en Configuración) marca que
  el proveedor retiró el producto con foto y día (`POST/DELETE /:token/retiro`,
  `src/services/reclamos/retiro.js`, regla `motivoNoRegistrarRetiro`). Solo
  deja constancia: no cambia el estado ni las decisiones.
- **Excel siempre obligatorio.** Documento SAP obligatorio salvo
  `RECLAMOS_SAP_DOC_OPCIONAL=true` fuera de producción.
- **Plantilla CEDI con encabezado**: arriba de la tabla puede traer
  PROVEEDOR, MARCA, DIVISIÓN y FACTURA / EMBARQUE (etiqueta + valor, como en
  Tienda) y el formulario se llena solo. Sin encabezado (formato viejo) se
  sigue leyendo, pero el proveedor queda para escribir a mano.
- **Fotos embebidas**: se extraen con `exceljs` y se guardan con hoja +
  `origen` (Excel principal o adjunto), para no mezclarlas entre archivos.
- **SAP (solo lectura)**: `src/services/sapProductosService.js` valida los
  códigos de barra (`MEAN`), trae la descripción (`MAKT`) y el precio de venta
  vigente (`A073`+`KONP`, `VKP0` / org. 1100 / canal FM, igual que la vista
  `SAP_V_PRECIO_VENTA`) e infiere el proveedor de la plantilla CEDI por su
  última OC (`EKPO`→`EKKO`→`LFA1`). Mandante 600, esquema `SAPSR3`. Si SAP no
  responde, la validación queda como "no disponible" y no bloquea.

## Tablero (por rol)

`/tablero` en el portal, `GET /api/tablero?dias=7|30|90|365` en la API
(`src/services/tableroService.js`, reglas puras en `src/domain/tablero.js`).
Se arma con los permisos del usuario, igual que Inicio, y está pensado para
leerse de un vistazo:

1. **Resumen**: una frase con cuántos casos esperan por ti y un semáforo
   (en tiempo hasta 7 días; revisar 8–14; atrasado 15+, contados desde que el
   caso llegó a su etapa), con el botón «Empezar por el más antiguo», y lo
   que hiciste en el periodo (solo lo que tiene movimiento). Tienda ve en qué
   etapa están sus reportes.
2. **Tus tareas**: una tarjeta por etapa que le toca, con su cantidad y su semáforo.
3. **Cómo van los casos**: por módulo, la ruta del caso (cuántos hay en cada
   etapa y cuánto se tarda entre etapas; la más lenta en ámbar) y las
   columnas día a día.
4. **Ver de dónde vienen los casos** (plegado): tiendas, motivos, divisiones, proveedores.

Productos Dañados respeta la vista parcial de Gof (`alcanceVista`). En «Vista
por», «Lo que hiciste» sigue siendo el del administrador. Solo lectura.

## Configuración → Correos

Solo el Administrador. Lista todos los correos que manda el portal
(`src/services/correo/catalogoCorreos.js`) con cuándo sale cada uno, quién lo
recibe y su vista previa con datos de EJEMPLO (escritorio, celular o solo
texto); «Enviarme una prueba» lo manda al correo de quien lo pide con
«[PRUEBA]» en el asunto. Desde ahí también se envía el **correo de bienvenida**
(`plantillaBienvenida.js`): qué es el portal, lo que puede hacer la persona
según los permisos de sus roles, cómo entrar y el botón «Entrar al portal»
(`PORTAL_URL`). Solo a quien tiene rol y correo; cada envío queda en el
Historial (`bienvenida`). Hasta 50 personas por envío y 10 envíos por minuto.

## Divisiones

Por ahora solo **Perfumería** y **Cosméticos** (migración `015`). Son las
activas de `ReclamoCatalogos` (`Tipo = 'division'`): los formularios las
muestran como botones y la API rechaza cualquier otra (`exigirDivision`,
`src/services/divisiones.js`); ya no se agregan divisiones nuevas al escribir.
Los reportes y reclamos viejos conservan la suya. Para ofrecer otra: insertarla
o poner `Activo = 1` en el catálogo.
