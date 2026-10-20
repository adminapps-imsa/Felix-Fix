/** Los 6 tipos de reclamo (fijos, no configurables). */
export const TIPOS = [
  'faltante_real',
  'sobrante_real',
  'diferencias',
  'danos_textil',
  'danos_perfumeria_cliente',
  'danos_perfumeria_gof',
  // El producto vuelve al proveedor: la compradora decide sus productos y Gof marca cuándo lo retiró.
  'devolucion',
];

export const ORIGENES = ['tienda', 'cedi'];
export const STATUS = ['pendiente', 'resuelto', 'rechazado', 'notificado', 'devuelto'];

/**
 * Productos (líneas) de estos tipos son evidencia directa: se auto-aprueban
 * al crearse y NO se pueden aprobar/rechazar/deshacer manualmente (409).
 */
export const TIPOS_AUTO_APROBADOS = new Set([
  'faltante_real',
  'danos_textil',
  'danos_perfumeria_cliente',
  'danos_perfumeria_gof',
]);

/** A nivel de todo el reclamo: quedan en 'notificado', sin flujo de aprobación. */
export const TIPOS_SOLO_NOTIFICACION = new Set(['danos_textil', 'danos_perfumeria_gof']);

export const COMENTARIO_AUTO_APROBADO =
  'Aprobado automáticamente — este tipo de reclamo no requiere revisión manual.';
export const USUARIO_SISTEMA = 'sistema';

export const esAutoAprobado = (tipo) => TIPOS_AUTO_APROBADOS.has(tipo);

/**
 * Categoría para comparar tipos: el detector por texto no distingue el
 * subtipo exacto de daños, así que cualquier danos_* cuenta como 'danos'.
 */
export const categoriaTipo = (tipo) => (tipo?.startsWith('danos_') ? 'danos' : tipo || null);

/**
 * Tipo efectivo de una línea: el de su propio MOTIVO; si no trae uno
 * reconocible, el del reclamo. Si ambos son "daños", gana el subtipo elegido
 * para el reclamo (el Excel no permite distinguir textil vs perfumería).
 */
export function resolverTipoLinea(tipoLinea, tipoReclamo) {
  if (!tipoLinea) return tipoReclamo;
  if (categoriaTipo(tipoLinea) === 'danos' && categoriaTipo(tipoReclamo) === 'danos') return tipoReclamo;
  return tipoLinea;
}
