// Bitácora del portal (Configuración → Bitácora, pedido del 2026-11-13).
//
// Qué se anota de cada petición a la API y cómo se describe. Reglas puras:
// el middleware (middleware/bitacora.js) y el registro en la BD
// (services/bitacora/registro.js) las usan.
//
//   Actividad: lo que cambia algo (POST/PUT/PATCH/DELETE) y salió bien.
//   Error:     cualquier petición que terminó mal.
//                - 'aviso': el portal lo rechazó (4xx): datos que faltan, sin
//                  permiso, Excel incompleto… Es del usuario, no del sistema.
//                - 'falla': el portal falló (5xx) o algo interno avisó un
//                  problema (SAP, correo, Keycloak…).
// Las lecturas (GET) que salen bien no se anotan: serían miles por día.

export const CLASES = ['actividad', 'error'];
export const NIVELES = ['info', 'aviso', 'falla'];

export const MODULOS = {
  reclamos: 'Reclamos',
  productos_danados: 'Productos Dañados',
  configuracion: 'Configuración',
  sesion: 'Sesión',
  contabilidad: 'Contabilidad',
  tablero: 'Tablero',
  sistema: 'Sistema',
};

const MUTA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// [método, patrón de la ruta (sin /api), módulo, acción, tipo de caso]
// El orden importa: la primera que coincide.
const RUTAS = [
  ['POST', '/auth/keycloak-code', 'sesion', 'Inició sesión'],

  ['PUT', '/configuracion/roles/:rol/permisos', 'configuracion', 'Cambió los permisos de un rol'],
  ['POST', '/configuracion/usuarios/:id/roles', 'configuracion', 'Dio un rol a un usuario'],
  ['DELETE', '/configuracion/usuarios/:id/roles/:rol', 'configuracion', 'Quitó un rol a un usuario'],
  ['PUT', '/configuracion/tiendas/usuarios/:id', 'configuracion', 'Cambió la tienda de un usuario'],
  ['POST', '/configuracion/correos/bienvenida/enviar', 'configuracion', 'Envió el correo de bienvenida'],
  ['POST', '/configuracion/correos/:id/prueba', 'configuracion', 'Envió un correo de prueba'],

  ['POST', '/reclamos/parse-excel', 'reclamos', 'Leyó un Excel para un reclamo nuevo'],
  ['POST', '/reclamos/parse-pdf', 'reclamos', 'Leyó un PDF de SAP para un reclamo nuevo'],
  ['POST', '/reclamos', 'reclamos', 'Creó un reclamo'],
  ['PUT', '/reclamos/:token/excel', 'reclamos', 'Reemplazó el Excel del reclamo', 'reclamo'],
  ['DELETE', '/reclamos/:token/excel', 'reclamos', 'Quitó el Excel del reclamo', 'reclamo'],
  ['PATCH', '/reclamos/:token/decision', 'reclamos', 'Cerró el reclamo (decisión)', 'reclamo'],
  ['POST', '/reclamos/:token/enviar-contabilidad', 'reclamos', 'Envió el reclamo a contabilidad', 'reclamo'],
  ['POST', '/reclamos/:token/devolver-supervisor', 'reclamos', 'Devolvió el reclamo (supervisor GOF)', 'reclamo'],
  ['POST', '/reclamos/:token/devolver', 'reclamos', 'Devolvió el reclamo con comentario', 'reclamo'],
  ['PATCH', '/reclamos/:token/datos', 'reclamos', 'Corrigió los datos del reclamo', 'reclamo'],
  ['PUT', '/reclamos/:token/lineas', 'reclamos', 'Corrigió los productos del reclamo', 'reclamo'],
  ['POST', '/reclamos/:token/reenviar', 'reclamos', 'Reenvió el reclamo corregido', 'reclamo'],
  ['PUT', '/reclamos/:token/retiro/requerido', 'reclamos', 'Cambió si el proveedor retira', 'reclamo'],
  ['POST', '/reclamos/:token/retiro', 'reclamos', 'Marcó «Entregado al proveedor»', 'reclamo'],
  ['DELETE', '/reclamos/:token/retiro', 'reclamos', 'Quitó «Entregado al proveedor»', 'reclamo'],
  ['POST', '/reclamos/:token/lineas/decision', 'reclamos', 'Decidió varios productos', 'reclamo'],
  ['POST', '/reclamos/:token/lineas/:pos/decision', 'reclamos', 'Decidió un producto', 'reclamo'],
  ['DELETE', '/reclamos/:token/lineas/:pos/decision', 'reclamos', 'Deshizo la decisión de un producto', 'reclamo'],
  ['PUT', '/reclamos/:token/lineas/:pos/codigo-sap', 'reclamos', 'Cargó el código SAP (Data)', 'reclamo'],
  ['POST', '/reclamos/:token/adjuntos', 'reclamos', 'Adjuntó un archivo', 'reclamo'],
  ['DELETE', '/reclamos/:token/adjuntos/:idx', 'reclamos', 'Eliminó un adjunto', 'reclamo'],
  ['DELETE', '/reclamos/:token', 'reclamos', 'Eliminó el reclamo', 'reclamo'],

  ['POST', '/productos-danados', 'productos_danados', 'Creó un reporte'],
  ['PUT', '/productos-danados/:id/correos', 'productos_danados', 'Guardó los correos del proveedor', 'reporte'],
  ['POST', '/productos-danados/:id/correo/enviar', 'productos_danados', 'Envió el reporte al proveedor', 'reporte'],
  ['POST', '/productos-danados/:id/adjuntos', 'productos_danados', 'Adjuntó un archivo', 'reporte'],
  ['DELETE', '/productos-danados/:id/adjuntos/:idx', 'productos_danados', 'Eliminó un adjunto', 'reporte'],
  ['PATCH', '/productos-danados/:id/documento-1700', 'productos_danados', 'Registró el documento 1700', 'reporte'],
  ['PATCH', '/productos-danados/:id/cerrar-nf', 'productos_danados', 'Validó el NF', 'reporte'],
  ['POST', '/productos-danados/:id/documentos-gof', 'productos_danados', 'Subió el documento de Gof', 'reporte'],
  ['PATCH', '/productos-danados/:id/enviar-contabilidad', 'productos_danados', 'Envió el reporte a contabilidad', 'reporte'],
  ['PATCH', '/productos-danados/:id/pago-recibido', 'productos_danados', 'Registró el pago', 'reporte'],
  ['PATCH', '/productos-danados/:id/devolver-tienda', 'productos_danados', 'Devolvió el reporte a la tienda', 'reporte'],
  ['PUT', '/productos-danados/:id/corregir', 'productos_danados', 'Corrigió el reporte', 'reporte'],
  ['PATCH', '/productos-danados/:id/aprobar', 'productos_danados', 'Aprobó el reporte', 'reporte'],
  ['PATCH', '/productos-danados/:id/rechazar', 'productos_danados', 'Rechazó el reporte (NF)', 'reporte'],
  ['POST', '/productos-danados/:id/procesar', 'productos_danados', 'Procesó el reporte en SAP', 'reporte'],
  ['DELETE', '/productos-danados/:id', 'productos_danados', 'Eliminó el reporte', 'reporte'],
].map(([metodo, patron, modulo, accion, recursoTipo]) => {
  const nombres = [];
  const re = new RegExp(
    `^${patron.replace(/:(\w+)/g, (_, n) => {
      nombres.push(n);
      return '([^/]+)';
    })}/?$`
  );
  return { metodo, re, nombres, modulo, accion, recursoTipo: recursoTipo ?? null };
});

/** Módulo por el comienzo de la ruta, para lo que no está en la tabla (p. ej. una lectura que falló). */
function moduloDeRuta(ruta) {
  const primero = ruta.split('/')[1] || '';
  if (primero === 'productos-danados') return 'productos_danados';
  if (primero === 'auth') return 'sesion';
  return MODULOS[primero] ? primero : 'sistema';
}

/**
 * Qué fue una petición: { modulo, accion, recursoTipo, recursoId }.
 * `ruta`: sin /api y sin query (`/reclamos/abc/decision`).
 */
export function describirPeticion(metodo, ruta) {
  const limpia = String(ruta || '/').split('?')[0].replace(/\/+$/, '') || '/';
  for (const r of RUTAS) {
    if (r.metodo !== metodo) continue;
    const m = r.re.exec(limpia);
    if (!m) continue;
    const params = Object.fromEntries(r.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const recursoId = r.recursoTipo === 'reclamo' ? params.token : r.recursoTipo === 'reporte' ? params.id : null;
    return { modulo: r.modulo, accion: r.accion, recursoTipo: recursoId ? r.recursoTipo : null, recursoId: recursoId ?? null };
  }
  const modulo = moduloDeRuta(limpia);
  const verbo = { GET: 'Consultó', POST: 'Envió', PUT: 'Guardó', PATCH: 'Cambió', DELETE: 'Borró' }[metodo] ?? metodo;
  return { modulo, accion: `${verbo} ${limpia}`, recursoTipo: null, recursoId: null };
}

/**
 * Si la petición va a la bitácora y cómo: null (no se anota) o { clase, nivel }.
 * No se anotan: lecturas que salieron bien, el health, ni la sesión vencida
 * al pedir /auth/me (pasa cada vez que alguien vuelve al portal).
 */
export function clasificarPeticion(metodo, ruta, estado) {
  const limpia = String(ruta || '').split('?')[0];
  if (limpia.startsWith('/health')) return null;
  if (estado >= 500) return { clase: 'error', nivel: 'falla' };
  if (estado >= 400) {
    if (estado === 401 && limpia.startsWith('/auth/me')) return null;
    return { clase: 'error', nivel: 'aviso' };
  }
  return MUTA.has(metodo) ? { clase: 'actividad', nivel: 'info' } : null;
}

/** Roles que se muestran: sin los internos de Keycloak (default-roles-…, offline_access, uma_authorization). */
export const rolesVisibles = (roles) =>
  [...(roles ?? [])].filter((r) => r && !/^default-roles-/.test(r) && r !== 'offline_access' && r !== 'uma_authorization').sort();

/** Número del caso para mostrar: REC-000044 / PD-52. */
export const numeroCaso = (recursoTipo, reclamoId, recursoId) =>
  recursoTipo === 'reclamo' && reclamoId ? `REC-${String(reclamoId).padStart(6, '0')}` : recursoTipo === 'reporte' && recursoId ? `PD-${recursoId}` : null;
