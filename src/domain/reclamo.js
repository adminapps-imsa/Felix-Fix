// Reglas de negocio de un reclamo: qué se puede hacer según su estado.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Cada
// regla devuelve null si la acción se permite, o { mensaje, code? } con el
// motivo si no; el servicio lo traduce al error HTTP que corresponda.

export const ESTADOS_CERRADOS = new Set(['resuelto', 'rechazado']);

export const estaCerrado = (status) => ESTADOS_CERRADOS.has(status);

const bloqueado = (mensaje) => ({ mensaje, code: 'RECLAMO_BLOQUEADO' });

/**
 * Para enviar a contabilidad, si la compradora aprobó productos debe haber
 * subida una nota de débito (PDF) validada contra sus decisiones.
 * `adjuntos`: los AdjuntosExtra del reclamo ya parseados.
 */
export function estadoNotaAprobada({ LineasAprobadas }, adjuntos) {
  return {
    RequiereNotaAprobada: Number(LineasAprobadas || 0) > 0,
    TieneNotaAprobada: adjuntos.some((a) => a?.tipo === 'pdf' && a.notaAprobada),
  };
}

/**
 * Un reclamo ya enviado a contabilidad o cerrado no se puede eliminar ni
 * cambiar sus adjuntos. `accion`: 'eliminar' | 'adjuntos'.
 * Excepción: quien tiene "Adjuntar en cualquier reclamo" (Torre de Control,
 * Gof) puede AGREGAR adjuntos (p. ej. el PDF) aunque ya haya decisión; pasar
 * `agregaTorreControl: true`. Eliminar adjuntos sigue bloqueado.
 */
export function motivoNoModificable({ Status, EnviadoContabilidadAt }, accion, { agregaTorreControl = false } = {}) {
  if (agregaTorreControl && accion === 'adjuntos') return null;
  const que = accion === 'eliminar' ? 'no se puede eliminar' : 'no se pueden agregar ni eliminar adjuntos';
  if (EnviadoContabilidadAt) return bloqueado(`Este reclamo ya se envió a contabilidad; ${que}.`);
  if (estaCerrado(Status)) return bloqueado(`Este reclamo ya está cerrado (${Status}); ${que}.`);
  return null;
}

/** El admin puede quitar adjuntos (p. ej. un PDF equivocado) aunque el reclamo esté cerrado; ya enviado a contabilidad, no. */
export function motivoNoEliminarAdjunto({ EnviadoContabilidadAt }) {
  return EnviadoContabilidadAt ? bloqueado('Este reclamo ya se envió a contabilidad; no se pueden eliminar adjuntos.') : null;
}

/** Cerrar el reclamo (Confirmar / Rechazar): solo con todos los productos decididos y si no es de notificación. */
export function motivoNoDecidir({ Status, LineasPendientes }) {
  if (Status === 'notificado') return { mensaje: 'Este reclamo es solo de notificación: no requiere aprobación.' };
  if (Status === 'pendiente' && LineasPendientes > 0) return motivoLineasPendientes(LineasPendientes);
  return null;
}

export const motivoLineasPendientes = (n) => ({
  mensaje: `Decide todos los productos antes de cerrar el reclamo (${n} pendientes).`,
  code: 'LINEAS_PENDIENTES',
});

/** Decidir o deshacer productos: no con el reclamo ya cerrado. */
export function motivoNoCambiarLineas({ Status }) {
  return estaCerrado(Status) ? { mensaje: 'El reclamo ya fue cerrado; no se pueden cambiar decisiones de productos.' } : null;
}

/**
 * Enviar a contabilidad: con el reclamo cerrado por la compradora y, si
 * aprobó productos, con la nota de débito validada ya subida.
 */
export function motivoNoEnviarContabilidad(reclamo, adjuntos) {
  if (!estaCerrado(reclamo.Status)) {
    return {
      mensaje: 'Primero la compradora debe cerrar el reclamo (Confirmar reclamo o Rechazar reclamo) antes de enviarlo a contabilidad.',
    };
  }
  const nota = estadoNotaAprobada(reclamo, adjuntos);
  if (nota.RequiereNotaAprobada && !nota.TieneNotaAprobada) {
    return {
      mensaje: 'Primero sube el documento (PDF de SAP) con los productos aprobados por la compradora; después podrás enviarlo a contabilidad.',
      code: 'FALTA_NOTA_APROBADA',
    };
  }
  return null;
}
