// Reglas de negocio de un reclamo: qué se puede hacer según su estado.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Cada
// regla devuelve null si la acción se permite, o { mensaje, code? } con el
// motivo si no; el servicio lo traduce al error HTTP que corresponda.

export const ESTADOS_CERRADOS = new Set(['resuelto', 'rechazado']);

export const numeroReclamo = (id) => `REC-${String(id).padStart(6, '0')}`;

// ------------------------------------------------------------------
// Documentos SAP: un documento pertenece a un solo reclamo.
// ------------------------------------------------------------------

/** "0004904487300" y "4904487300" son el mismo documento: solo dígitos, sin ceros a la izquierda. */
export function normalizarDocSap(valor) {
  const texto = String(valor ?? '').trim();
  const digitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digitos || texto.toUpperCase();
}

/**
 * Documentos SAP de un reclamo guardado: los del formulario y los que traen
 * impresos sus PDF adjuntos. `sapDocsExtra` y `adjuntos` ya parseados.
 */
export function documentosDelReclamo({ SapDoc1, SapDoc2, SapDoc3 }, sapDocsExtra, adjuntos) {
  const docs = [SapDoc1, SapDoc2, SapDoc3, ...sapDocsExtra, ...adjuntos.map((a) => a?.documentoSap)];
  return new Set(docs.filter((d) => d && String(d).trim()).map(normalizarDocSap));
}

/** El mismo documento escrito dos veces en el formulario. */
export function motivoDocsRepetidos(docs) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const d of docs) {
    const clave = normalizarDocSap(d);
    if (vistos.has(clave)) repetidos.add(d);
    vistos.add(clave);
  }
  if (!repetidos.size) return null;
  return {
    mensaje: `El documento SAP ${[...repetidos].join(', ')} está escrito más de una vez. Déjalo una sola vez.`,
    code: 'DOC_SAP_REPETIDO',
  };
}

/**
 * Qué documentos de `docs` ya están en otros reclamos. `otros`: reclamos
 * guardados como [{ ReclamoId, Token, Status, documentos: Set }] (ver
 * documentosDelReclamo). Devuelve [{ documento, reclamos: [{ numero, token, status }] }].
 */
export function documentosUsados(docs, otros) {
  const usados = [];
  for (const documento of [...new Set(docs)]) {
    const clave = normalizarDocSap(documento);
    const reclamos = otros
      .filter((o) => o.documentos.has(clave))
      .map((o) => ({ numero: numeroReclamo(o.ReclamoId), token: o.Token, status: o.Status }));
    if (reclamos.length) usados.push({ documento, reclamos });
  }
  return usados;
}

const listaReclamos = (rs) => rs.map((r) => r.numero).join(', ');

/** No se crea un reclamo con un documento SAP que ya tiene otro reclamo. */
export function motivoDocsEnOtrosReclamos(docs, otros) {
  const usados = documentosUsados(docs, otros);
  if (!usados.length) return null;
  const detalle = usados.map((u) => `${u.documento} ya está en ${listaReclamos(u.reclamos)}`).join('; ');
  return {
    mensaje: `Ya existe un reclamo con ${usados.length === 1 ? 'este documento SAP' : 'estos documentos SAP'}: ${detalle}. No se puede crear otro reclamo con el mismo documento.`,
    code: 'DOC_SAP_DUPLICADO',
    usados,
  };
}

/**
 * Un PDF de SAP que se adjunta a un reclamo debe ser de un documento de ese
 * reclamo o de uno nuevo (p. ej. la nota de débito); nunca de un documento que
 * pertenece a otro reclamo.
 */
export function motivoPdfDeOtroReclamo(numeroPdf, documentosPropios, otros) {
  if (!numeroPdf || documentosPropios.has(normalizarDocSap(numeroPdf))) return null;
  const [usado] = documentosUsados([numeroPdf], otros);
  if (!usado) return null;
  return {
    mensaje: `Este PDF es del documento SAP ${numeroPdf}, que pertenece a ${listaReclamos(usado.reclamos)}. Súbelo en ese reclamo.`,
    code: 'DOC_SAP_DE_OTRO_RECLAMO',
  };
}

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
