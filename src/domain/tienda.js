// Tienda del usuario (Configuración → Tiendas): qué casos ve y cuáles crea.
//
// `alcance`: null (ve todas las tiendas y lo de todos) o
//   { tiendaId, codigo, nombre, soloPropios, username }
//   - tiendaId (o null): solo los casos de esa tienda. En Reclamos, los de
//     origen Tienda con esa sucursal (por nombre o código); los de CEDI no.
//   - soloPropios: además, solo los que creó el mismo usuario.
// Quien creó el caso siempre lo ve, aunque la sucursal escrita no coincida con
// su tienda (pedido del 2026-11-13: Dixa no veía los que creó).
// Reglas puras: el SQL equivalente está en services/acceso/alcanceTienda.js.

/** Texto comparable: sin acentos, mayúsculas y sin espacios de sobra («Vía España » = «VIA ESPANA»). */
export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const mismoUsuario = (a, b) => normalizar(a) !== '' && normalizar(a) === normalizar(b);

/** Además, sin espacios: «ALTAPLAZA» = «Alta Plaza». */
const compacto = (s) => normalizar(s).replace(/ /g, '');

/**
 * Otros nombres con que se escribe cada tienda (por código). TD28 se llamaba
 * «Town Center» y la gente escribe «Costa del Este»: desde el 2026-11-13 su
 * nombre es «Costa del Este» (migración 038) y «Town Center» queda como alias.
 */
export const ALIAS_TIENDAS = { TD28: ['Town Center', 'Town Center Costa del Este', 'Costa del Este Town Center'] };

/** Todas las formas válidas de escribir la tienda (`tienda`: { nombre, codigo }), compactas. */
export const formasDe = (tienda) => [tienda.nombre, tienda.codigo, ...(ALIAS_TIENDAS[String(tienda.codigo ?? '').toUpperCase()] ?? [])].map(compacto).filter(Boolean);

/** true si la sucursal escrita en un reclamo es la tienda (por nombre, código o alias; sin acentos ni espacios). */
export const esSucursalDe = (sucursal, tienda) => Boolean(tienda) && compacto(sucursal) !== '' && formasDe(tienda).includes(compacto(sucursal));

/**
 * La tienda del catálogo que corresponde a lo escrito («TD28», «costa del
 * este», «ALTAPLAZA», «Town Center»), o null. `tiendas`: filas { Codigo, Nombre }.
 */
export const tiendaDeSucursal = (sucursal, tiendas) =>
  (tiendas ?? []).find((t) => esSucursalDe(sucursal, { nombre: t.Nombre, codigo: t.Codigo })) ?? null;

/** true si el usuario con ese alcance ve el reporte de Productos Dañados `r`. */
export function veReporte(alcance, r) {
  if (!alcance || mismoUsuario(r?.EmpleadoReportaUsuario, alcance.username)) return true;
  if (alcance.tiendaId != null && Number(r?.TiendaId) !== Number(alcance.tiendaId)) return false;
  if (alcance.soloPropios && !mismoUsuario(r?.EmpleadoReportaUsuario, alcance.username)) return false;
  return true;
}

/** true si el usuario con ese alcance ve el reclamo `r`. */
export function veReclamo(alcance, r) {
  if (!alcance || mismoUsuario(r?.CreatedBy, alcance.username)) return true;
  if (alcance.tiendaId != null && !(r?.Origen === 'tienda' && esSucursalDe(r?.Sucursal, alcance))) return false;
  if (alcance.soloPropios && !mismoUsuario(r?.CreatedBy, alcance.username)) return false;
  return true;
}

/** Al crear o corregir un reporte: null si puede usar esa tienda, o el motivo. */
export function motivoTiendaReporte(alcance, tiendaId) {
  if (!alcance || alcance.tiendaId == null) return null;
  return Number(tiendaId) === Number(alcance.tiendaId) ? null : `Solo puedes registrar reportes de tu tienda (${alcance.nombre}).`;
}

/** Al crear o corregir un reclamo: null si puede usar ese origen y sucursal, o el motivo. */
export function motivoTiendaReclamo(alcance, { origen, sucursal }) {
  if (!alcance || alcance.tiendaId == null) return null;
  if (origen !== 'tienda') return `Tu usuario está en la tienda ${alcance.nombre}: solo puedes crear reclamos de Tienda, no de CEDI.`;
  return esSucursalDe(sucursal, alcance) ? null : `Solo puedes crear reclamos de tu tienda (${alcance.nombre}).`;
}
