# Felix Fix — API + módulo Productos Dañados

Proyecto nuevo (no existía código previo en este repo). Backend Express +
MSSQL + OracleDB(SAP), frontend React + TypeScript + Vite + Tailwind CSS v4.

## Estructura

```
src/            backend (Express, entry point src/index.js, puerto 3001)
sql/migrations/ scripts .sql numerados para SQL Server (ver sql/migrations/README.md)
uploads/        evidencia local (fotos), gitignored
deploy/         systemd + Nginx de REFERENCIA — no instalados, revisar antes de aplicar
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
Sin `KEYCLOAK_ISSUER_URL/JWKS_URI/AUDIENCE`, las rutas protegidas responden
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

Ver `sql/migrations/README.md`. Ejecutar los scripts en orden (000 a 010)
contra la base de datos del portal (`node sql/migrate.js`).

## Decisiones tomadas sin información completa (revisar)

1. **Convención de nombres SQL**: PascalCase estándar de SQL Server, por no
   existir una convención previa en el portal.
2. **Estado transitorio `EnProceso`**: no pedido explícitamente; existe solo
   para evitar condiciones de carrera en la transición Aprobado → Procesado
   (ver `src/services/productosDanadosService.js`).
3. **Evidencia (fotos)**: implementada con disco local por defecto
   (`EVIDENCE_STORAGE_PROVIDER=local`), detrás de una abstracción en
   `src/services/evidenceStorage/`. La integración con Paperless-ngx queda
   en `paperlessStorage.js` como stub sin terminar — falta que confirmes
   URL/API/token de tu instancia y cómo se debe recuperar el archivo después.
4. **Keycloak**: variables de entorno vacías (`.env.example` y
   `portal/.env.example`); roles esperados nombrados
   `productos-danados:crear/aprobar/procesar` — confirmar cómo están
   modelados los roles/claims en tu realm real.
5. **Catálogo de tiendas**: `sql/migrations/004_seed_tiendas.sql` trae solo
   3 filas de ejemplo. La base del portal ya tiene 6 tiendas (TD04 Vía España,
   TD15 Multiplaza, TD20 Albrook, TD26 Alta Plaza, TD28 Town Center,
   TD30 Metromall); confirmar si falta alguna.
6. **Visibilidad entre tiendas**: por defecto cualquier usuario autenticado
   ve reportes de todas las tiendas (no se pidió scoping por tienda).
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

## Productos Dañados — flujo y avisos

Pendiente → (compradora envía al proveedor) → **NF**: supervisor GOF cierra,
o **Devolución aprobada**: Gof sube el documento → Contabilidad registra el
pago → Cerrado. Los permisos de cada paso se asignan por rol en Configuración.

**Avisos por correo a cada área** (`src/services/correo/avisosProductosDanados.js`):
cuando un reporte llega a una etapa se avisa a los usuarios cuyos roles tienen
el permiso de esa etapa:

| Etapa | Permiso que recibe el aviso |
|---|---|
| Reporte nuevo (Pendiente) | `productos_danados.enviar` |
| NF | `productos_danados.nf` |
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

- **Acceso**: rol `KEYCLOAK_ROLE_RECLAMOS` (ver/crear). Aprobar/rechazar y
  eliminar: solo los usernames de `RECLAMOS_ADMIN_USERS` (separados por coma).
- **Auto-aprobado por producto**: faltante_real y cualquier daño se aprueban
  al crear y no se pueden decidir a mano (409). Sobrante/diferencias sí.
- **Adjuntos**: quien creó el reclamo (en los suyos), quien decide, o quien
  tiene `reclamos.adjuntar` (Torre de Control) en cualquier reclamo.
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
