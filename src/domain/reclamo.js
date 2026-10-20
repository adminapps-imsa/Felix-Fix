// Reglas de negocio de un reclamo: qué se puede hacer según su estado.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Cada
// regla devuelve null si la acción se permite, o { mensaje, code? } con el
// motivo si no; el servicio lo traduce al error HTTP que corresponda.

export const ESTADOS_CERRADOS = new Set(['resuelto', 'rechazado']);

export const numeroReclamo = (id) => `REC-${String(id).padStart(6, '0')}`;

// ------------------------------------------------------------------
// Fecha de llegada de la mercancía (obligatoria en Tienda y CEDI).
// ------------------------------------------------------------------

/**
 * La fecha en que llegó la mercancía ('AAAA-MM-DD'): obligatoria, una fecha
 * real y no posterior a hoy. `hoy` es el día de Panamá ('AAAA-MM-DD').
 */
export function motivoFechaLlegadaInvalida(fecha, hoy) {
  const f = String(fecha ?? '').trim();
  if (!f) return { mensaje: 'Indica la fecha de llegada de la mercancía.', code: 'FECHA_LLEGADA' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Una fecha imposible (2026-02-30) cambia de mes al construirla.
  if (!d || d.toISOString().slice(0, 10) !== f) return { mensaje: `La fecha de llegada de la mercancía no es válida («${f}»).`, code: 'FECHA_LLEGADA' };
  if (f > hoy) return { mensaje: 'La fecha de llegada de la mercancía no puede ser posterior a hoy.', code: 'FECHA_LLEGADA' };
  return null;
}

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

// ------------------------------------------------------------------
// Nota de débito (PDF de SAP) contra las decisiones de la compradora.
// ------------------------------------------------------------------

/** "#3 7501234567890 TROUSERS BOY, RED, 7" para los mensajes. */
const describirProducto = (l) => [`#${l.posicion}`, l.codigoBarra, l.descripcion].filter(Boolean).join(' ');
/** Hasta 10 elementos; del resto solo se dice cuántos son. */
const listaCorta = (xs, fn) => xs.slice(0, 10).map(fn).join(' · ') + (xs.length > 10 ? ` · y ${xs.length - 10} más` : '');

/**
 * Una nota de débito solo puede traer productos que la compradora aprobó.
 * `lineas`: filas del PDF ya cruzadas con los productos del reclamo (`cruzar`
 * de contabilidad/validarDocumento.js: { lineaId, posicion, decision, … }).
 * Devuelve null si cuadra (o no trae productos del reclamo: no es una nota),
 * o { mensaje, code, productos? }.
 */
export function motivoNotaNoCuadra(lineas, numeroDocumento) {
  const enReclamo = lineas.filter((l) => l.lineaId !== null);
  const noEnReclamo = lineas.filter((l) => l.lineaId === null);
  const rechazados = enReclamo.filter((l) => l.decision === 'rechazado');
  const sinAprobar = enReclamo.filter((l) => l.decision === null);
  const doc = numeroDocumento ? ` (documento ${numeroDocumento})` : '';
  const base = `Documento SAP debe coincidir con los productos aprobados${doc}.`;
  if (rechazados.length) {
    return {
      mensaje: `${base} Trae ${rechazados.length} producto(s) rechazado(s) por la compradora: ${listaCorta(rechazados, describirProducto)}.`,
      code: 'PDF_PRODUCTO_RECHAZADO',
      productos: rechazados.map((l) => l.posicion),
    };
  }
  if (sinAprobar.length) {
    return {
      mensaje: `${base} Trae ${sinAprobar.length} producto(s) que la compradora aún no aprueba: ${listaCorta(sinAprobar, describirProducto)}.`,
      code: 'PDF_PRODUCTO_SIN_APROBAR',
      productos: sinAprobar.map((l) => l.posicion),
    };
  }
  if (noEnReclamo.length) {
    return {
      mensaje: `${base} Trae ${noEnReclamo.length} producto(s) que no están en este reclamo: ${listaCorta(noEnReclamo, (l) => l.descripcion || l.material)}.`,
      code: 'PDF_PRODUCTO_NO_EN_RECLAMO',
    };
  }
  return null;
}

/** La nota sirve como «nota aprobada»: cuadra y trae al menos un producto del reclamo. */
export const esNotaAprobada = (lineas) => !motivoNotaNoCuadra(lineas) && lineas.some((l) => l.lineaId !== null);

/**
 * Al enviar a contabilidad: la marca `notaAprobada` se puso al subir el PDF y
 * las decisiones pudieron cambiar después (deshacer y rechazar). Se vuelven a
 * cruzar las notas marcadas con las decisiones actuales.
 * `notas`: [{ nombre, numeroDocumento, legible, lineas }] de los PDF marcados.
 */
export function motivoNotasYaNoCuadran(notas) {
  for (const n of notas) {
    const motivo = n.legible
      ? motivoNotaNoCuadra(n.lineas, n.numeroDocumento) ||
        (esNotaAprobada(n.lineas) ? null : { mensaje: 'Ya no trae productos de este reclamo.' })
      : { mensaje: 'Ya no se puede leer el PDF para comprobarlo.' };
    if (motivo) {
      return {
        mensaje: `La nota de débito «${n.nombre}» ya no cuadra con las decisiones actuales de la compradora. ${motivo.mensaje} Quita ese PDF o sube el correcto antes de enviarlo a contabilidad.`,
        code: 'NOTA_NO_CUADRA',
        ...(motivo.productos && { productos: motivo.productos }),
      };
    }
  }
  return null;
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
  if (Status === STATUS_DEVUELTO) return MOTIVO_DEVUELTO;
  if (Status === 'pendiente' && LineasPendientes > 0) return motivoLineasPendientes(LineasPendientes);
  return null;
}

export const motivoLineasPendientes = (n) => ({
  mensaje: `Decide todos los productos antes de cerrar el reclamo (${n} pendientes).`,
  code: 'LINEAS_PENDIENTES',
});

/** Decidir o deshacer productos: no con el reclamo ya cerrado. */
export function motivoNoCambiarLineas({ Status }) {
  if (Status === STATUS_DEVUELTO) return MOTIVO_DEVUELTO;
  return estaCerrado(Status) ? { mensaje: 'El reclamo ya fue cerrado; no se pueden cambiar decisiones de productos.' } : null;
}

// ------------------------------------------------------------------
// Retiro del proveedor (reclamos de devolución): Gof marca que el proveedor
// ya se llevó el producto, con foto y día. No cambia el estado del reclamo.
// ------------------------------------------------------------------

/** Es de devolución si el reclamo es de ese tipo o alguno de sus productos trae el motivo «devolución». */
export const esDevolucion = ({ Tipo, LineasDevolucion }) => Tipo === 'devolucion' || Number(LineasDevolucion) > 0;

/**
 * Registrar el retiro: solo en reclamos de devolución, con la foto y el día
 * (una fecha real, no posterior a hoy). `hoy`: día de Panamá 'AAAA-MM-DD'.
 */
export function motivoNoRegistrarRetiro(reclamo, { fecha, tieneFoto, hoy }) {
  if (!esDevolucion(reclamo)) return { mensaje: 'Solo los reclamos de devolución llevan el retiro del proveedor.', code: 'NO_ES_DEVOLUCION' };
  if (!tieneFoto) return { mensaje: 'Adjunta la foto del retiro.', code: 'FALTA_FOTO_RETIRO' };
  const f = String(fecha ?? '').trim();
  if (!f) return { mensaje: 'Indica el día en que el proveedor retiró el producto.', code: 'FECHA_RETIRO' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.toISOString().slice(0, 10) !== f) return { mensaje: `El día del retiro no es una fecha válida («${f}»).`, code: 'FECHA_RETIRO' };
  if (f > hoy) return { mensaje: 'El día del retiro no puede ser posterior a hoy.', code: 'FECHA_RETIRO' };
  return null;
}

// ------------------------------------------------------------------
// Devolución: la compradora lo devuelve a quien lo creó para corregirlo.
//   pendiente --(compradora: devolver + comentario)--> devuelto
//   devuelto  --(quien lo creó: corregir y reenviar)--> pendiente
// Las decisiones de productos que ya tomó la compradora se conservan.
// ------------------------------------------------------------------

export const STATUS_DEVUELTO = 'devuelto';
export const MIN_COMENTARIO_DEVOLUCION = 5;

const MOTIVO_DEVUELTO = {
  mensaje: 'El reclamo está devuelto a quien lo creó para corregirlo; podrás seguir cuando lo reenvíe.',
  code: 'RECLAMO_DEVUELTO',
};

/** La compradora devuelve un reclamo pendiente, siempre con un comentario que diga qué corregir. */
export function motivoNoDevolver({ Status, CreatedBy }, comentario) {
  if (Status === STATUS_DEVUELTO) return { mensaje: 'Este reclamo ya está devuelto; espera a que lo corrijan y lo reenvíen.', code: 'RECLAMO_DEVUELTO' };
  if (Status !== 'pendiente') return { mensaje: 'Solo se puede devolver un reclamo pendiente de decisión.', code: 'NO_DEVOLVIBLE' };
  if (!CreatedBy) return { mensaje: 'Este reclamo no tiene quién lo creó: no hay a quién devolverlo.', code: 'NO_DEVOLVIBLE' };
  if (String(comentario ?? '').trim().length < MIN_COMENTARIO_DEVOLUCION) {
    return { mensaje: 'Escribe qué hay que corregir para que quien lo creó sepa qué arreglar.', code: 'FALTA_COMENTARIO' };
  }
  return null;
}

/** Corregir datos o archivos de un reclamo devuelto: solo quien lo creó (o el super administrador). */
export function motivoNoCorregir({ Status, CreatedBy }, { username, esAdmin = false }) {
  if (Status !== STATUS_DEVUELTO) return { mensaje: 'Solo se corrige un reclamo que la compradora devolvió.', code: 'NO_DEVUELTO' };
  if (!esAdmin && CreatedBy !== username) return { mensaje: 'Solo quien creó el reclamo puede corregirlo y reenviarlo.', code: 'NO_ES_CREADOR' };
  return null;
}

/**
 * Reenviar a la compradora: además de poder corregirlo, cada documento SAP del
 * reclamo tiene su PDF, y no queda el PDF de un documento que ya se quitó.
 * `pdfs`: [{ nombre, documento }] — el documento que trae cada PDF (null si no se sabe).
 * `documentoOpcional`: fuera de producción el documento SAP puede faltar.
 */
export function motivoNoReenviar(reclamo, usuario, { docs, pdfs, documentoOpcional = false }) {
  const base = motivoNoCorregir(reclamo, usuario);
  if (base) return base;
  if (!docs.length && !documentoOpcional) return { mensaje: 'Escribe al menos un documento SAP antes de reenviar.', code: 'FALTA_DOC_SAP' };
  const deLosPdf = new Set(pdfs.filter((p) => p.documento).map((p) => normalizarDocSap(p.documento)));
  const faltan = docs.filter((d) => !deLosPdf.has(normalizarDocSap(d)));
  if (faltan.length) {
    return {
      mensaje: faltan.length === 1 ? `Falta el PDF del documento SAP ${faltan[0]}. Súbelo antes de reenviar.` : `Faltan los PDF de los documentos SAP ${faltan.join(', ')}. Súbelos antes de reenviar.`,
      code: 'FALTAN_PDF_SAP',
      faltan,
    };
  }
  const propios = new Set(docs.map(normalizarDocSap));
  const sobra = pdfs.find((p) => p.documento && !propios.has(normalizarDocSap(p.documento)));
  if (sobra) {
    return {
      mensaje: `El PDF «${sobra.nombre}» es del documento ${sobra.documento}, que ya no está en el reclamo. Quítalo o vuelve a escribir ese documento antes de reenviar.`,
      code: 'PDF_DE_DOC_QUITADO',
    };
  }
  return null;
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
