// Reglas de negocio de un reclamo: qué se puede hacer según su estado.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Cada
// regla devuelve null si la acción se permite, o { mensaje, code? } con el
// motivo si no; el servicio lo traduce al error HTTP que corresponda.

export const ESTADOS_CERRADOS = new Set(['resuelto', 'rechazado']);

export const numeroReclamo = (id) => `REC-${String(id).padStart(6, '0')}`;

/**
 * Estado con que nace un reclamo. Los de solo notificación quedan
 * 'notificado'. Si TODOS sus productos se aprobaron solos (p. ej. solo
 * faltante real), la compradora no tiene nada que decidir: nace 'resuelto'
 * (cierre automático) y pasa directo a la cola de envío a contabilidad.
 * Si no, 'pendiente' hasta que la compradora lo cierre.
 */
/**
 * Solo notificación: el tipo del reclamo es de notificación (daños textil…) y
 * TODOS sus productos también. Si mezcla otros (p. ej. faltantes con su 911,
 * como el 23294 - NOIR / REC-000044), sigue el flujo normal y va a
 * contabilidad. `tipos`: los tipos de solo notificación.
 */
export const esSoloNotificacion = ({ tipo, lineas }, tipos) =>
  tipos.has(tipo) && (lineas ?? []).every((l) => tipos.has(l.tipo ?? l.Tipo));

export function estadoAlCrear({ soloNotificacion, lineas }) {
  if (soloNotificacion) return 'notificado';
  if (lineas.length && lineas.every((l) => l.decStatus === 'aprobado')) return 'resuelto';
  return 'pendiente';
}

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
 * Faltantes que no están en los 911 subidos, o con otra cantidad
 * (resultado de `faltantesContra911`). null si todos cuadran.
 */
export function motivoFaltantesNoEn911({ noEstan, cantidadDistinta }) {
  if (!noEstan.length && !cantidadDistinta.length) return null;
  const partes = [];
  if (noEstan.length) partes.push(`No aparecen en los PDF del 911: ${listaCorta(noEstan, describirProducto)}.`);
  if (cantidadDistinta.length) {
    partes.push(
      `Otra cantidad que en el 911: ${listaCorta(cantidadDistinta, (g) => `${g.lineas.map(describirProducto).join(' + ')} (Excel ${g.cantidad}, 911 ${g.cantidad911})`)}.`
    );
  }
  return {
    mensaje: `Los faltantes del Excel deben estar en el documento 911. ${partes.join(' ')} Revisa el Excel o sube el 911 correcto.`,
    code: 'FALTANTE_NO_EN_911',
    productos: [...noEstan, ...cantidadDistinta.flatMap((g) => g.lineas)].map((l) => l.posicion),
  };
}

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
 * Para enviar a contabilidad, si la compradora aprobó algún SOBRANTE debe
 * haber subida la nota de débito (912) validada contra sus decisiones.
 * Faltante, devolución, diferencias y daños se aprueban solos y van solo con
 * el documento del 911 (subido al crear el reclamo); si el sobrante se
 * rechaza, tampoco se pide el 912.
 * `adjuntos`: los AdjuntosExtra del reclamo ya parseados.
 */
export function estadoNotaAprobada({ LineasSobranteAprobadas }, adjuntos) {
  return {
    RequiereNotaAprobada: Number(LineasSobranteAprobadas || 0) > 0,
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

/** Aprobar un sobrante no esperado sin SAP sin los datos del artículo para Data. */
export const MOTIVO_FALTAN_DATOS_ARTICULO = {
  mensaje: 'Este sobrante no esperado no está en SAP: para aprobarlo llena costo, precio de venta, categoría, tipo de producto, descripción y marca (y, si lo sabes, el ciclo de vida) (le llegan a Data para crearlo).',
  code: 'FALTAN_DATOS_ARTICULO',
};

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
// Retiro del proveedor: al crear el reclamo se contesta si el proveedor va a
// retirar el producto (las devoluciones, siempre). Si sí, el reclamo queda
// esperando el retiro hasta que Gof marca «Entregado al proveedor» con foto
// y día. No cambia el Status: solo si el reclamo cuenta como terminado.
// ------------------------------------------------------------------

/** Es de devolución si el reclamo es de ese tipo o alguno de sus productos trae el motivo «devolución». */
export const esDevolucion = ({ Tipo, LineasDevolucion }) => Tipo === 'devolucion' || Number(LineasDevolucion) > 0;

/**
 * Lo retira el proveedor: las devoluciones siempre; los demás si al crearlo
 * se contestó que sí (RetiroProveedor). Los creados antes de la pregunta
 * (RetiroProveedor null) solo si son de devolución.
 */
export const llevaRetiro = (r) => esDevolucion(r) || r.RetiroProveedor === true || r.RetiroProveedor === 1;

/** Esperando que el proveedor se lo lleve: lleva retiro y todavía no se registró la entrega. */
export const esperaRetiro = (r) => llevaRetiro(r) && !r.RetiroProveedorFecha;

/**
 * Registrar la entrega: solo en reclamos que el proveedor retira, con la foto
 * y el día (una fecha real, no posterior a hoy). `hoy`: día de Panamá 'AAAA-MM-DD'.
 */
export function motivoNoRegistrarRetiro(reclamo, { fecha, tieneFoto, hoy }) {
  if (!llevaRetiro(reclamo)) return { mensaje: 'Este reclamo no lo retira el proveedor.', code: 'SIN_RETIRO' };
  if (!tieneFoto) return { mensaje: 'Adjunta la foto del retiro.', code: 'FALTA_FOTO_RETIRO' };
  const f = String(fecha ?? '').trim();
  if (!f) return { mensaje: 'Indica el día en que el proveedor retiró el producto.', code: 'FECHA_RETIRO' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.toISOString().slice(0, 10) !== f) return { mensaje: `El día del retiro no es una fecha válida («${f}»).`, code: 'FECHA_RETIRO' };
  if (f > hoy) return { mensaje: 'El día del retiro no puede ser posterior a hoy.', code: 'FECHA_RETIRO' };
  return null;
}

/**
 * Cambiar la respuesta de «¿lo retira el proveedor?» (si se contestó mal al
 * crearlo): solo quien lo creó o el super administrador, nunca en una
 * devolución (siempre lo lleva) ni con la entrega ya registrada.
 */
export function motivoNoCambiarRetiro(reclamo, { username, esAdmin = false }) {
  if (esDevolucion(reclamo)) return { mensaje: 'Los reclamos de devolución siempre los retira el proveedor.', code: 'ES_DEVOLUCION' };
  if (reclamo.RetiroProveedorFecha) return { mensaje: 'La entrega al proveedor ya está registrada; quítala primero si fue un error.', code: 'RETIRO_REGISTRADO' };
  if (!esAdmin && reclamo.CreatedBy !== username) return { mensaje: 'Solo quien creó el reclamo puede cambiar si lo retira el proveedor.', code: 'NO_ES_CREADOR' };
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

// ------------------------------------------------------------------
// Devolución del supervisor GOF: en cualquier estado mientras no se haya
// enviado a contabilidad. Al reenviarlo vuelve al estado que tenía.
//   pendiente | notificado | resuelto | rechazado --(supervisor GOF)--> devuelto
//   devuelto --(quien lo creó: corregir y reenviar)--> estadoAlReenviar(...)
// ------------------------------------------------------------------

export const DEVUELTO_POR_COMPRADORA = 'compradora';
export const DEVUELTO_POR_SUPERVISOR = 'supervisor_gof';
export const ESTADOS_DEVOLVIBLES_SUPERVISOR = new Set(['pendiente', 'notificado', 'resuelto', 'rechazado']);

/** El supervisor GOF devuelve el reclamo a quien lo creó, siempre con el motivo. */
export function motivoNoDevolverSupervisor({ Status, CreatedBy, EnviadoContabilidadAt }, comentario) {
  if (Status === STATUS_DEVUELTO) return { mensaje: 'Este reclamo ya está devuelto; espera a que lo corrijan y lo reenvíen.', code: 'RECLAMO_DEVUELTO' };
  if (EnviadoContabilidadAt) return { mensaje: 'Este reclamo ya se envió a contabilidad; ya no se puede devolver.', code: 'NO_DEVOLVIBLE' };
  if (!ESTADOS_DEVOLVIBLES_SUPERVISOR.has(Status)) return { mensaje: `No se puede devolver un reclamo en estado «${Status}».`, code: 'NO_DEVOLVIBLE' };
  if (!CreatedBy) return { mensaje: 'Este reclamo no tiene quién lo creó: no hay a quién devolverlo.', code: 'NO_DEVOLVIBLE' };
  if (String(comentario ?? '').trim().length < MIN_COMENTARIO_DEVOLUCION) {
    return { mensaje: 'Escribe el motivo de la devolución para que quien lo creó sepa qué arreglar.', code: 'FALTA_COMENTARIO' };
  }
  return null;
}

/**
 * Estado al reenviar un reclamo devuelto: el que tenía al devolverlo (sin dato:
 * pendiente, como las devoluciones de la compradora). Si estaba cerrado pero
 * quedaron productos por decidir (quien lo creó los cambió), vuelve a
 * pendiente para que la compradora los decida.
 */
export function estadoAlReenviar({ StatusAntesDevolucion, LineasPendientes }) {
  const antes = StatusAntesDevolucion && StatusAntesDevolucion !== STATUS_DEVUELTO ? StatusAntesDevolucion : 'pendiente';
  if (estaCerrado(antes) && Number(LineasPendientes) > 0) return 'pendiente';
  return antes;
}

/** Corregir datos o archivos de un reclamo devuelto: solo quien lo creó (o el super administrador). */
export function motivoNoCorregir({ Status, CreatedBy }, { username, esAdmin = false }) {
  if (Status !== STATUS_DEVUELTO) return { mensaje: 'Solo se corrige un reclamo devuelto para corregir.', code: 'NO_DEVUELTO' };
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
 * aprobó sobrantes, con la nota de débito (912) validada ya subida.
 */
export function motivoNoEnviarContabilidad(reclamo, adjuntos) {
  if (!estaCerrado(reclamo.Status)) {
    return {
      mensaje: 'Primero la compradora debe cerrar el reclamo (Confirmar reclamo o Rechazar reclamo) antes de enviarlo a contabilidad.',
    };
  }
  // Sobrantes no esperados aprobados que no están en SAP: sin el artículo no hay 912.
  const n = Number(reclamo.LineasEsperaData || 0);
  if (n > 0) {
    return {
      mensaje: `${n === 1 ? 'Un sobrante no esperado aprobado' : `${n} sobrantes no esperados aprobados`} todavía no ${n === 1 ? 'está creado' : 'están creados'} en SAP. Cuando Data ${n === 1 ? 'lo cree' : 'los cree'} y cargue el código, haz el 912 y envíalo a contabilidad.`,
      code: 'ESPERA_DATA',
    };
  }
  const nota = estadoNotaAprobada(reclamo, adjuntos);
  if (nota.RequiereNotaAprobada && !nota.TieneNotaAprobada) {
    return {
      mensaje: 'Primero sube el documento 912 (PDF de SAP) con los sobrantes aprobados por la compradora; después podrás enviarlo a contabilidad.',
      code: 'FALTA_NOTA_APROBADA',
    };
  }
  return null;
}

// ------------------------------------------------------------------
// Corregir productos de un reclamo devuelto (quien lo creó).
// ------------------------------------------------------------------

const textoLinea = (v) => String(v ?? '').trim();
const cantidadLinea = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Compara los productos guardados con los que mandó quien corrige y dice qué
 * hacer con cada uno. Los que no cambian conservan la decisión de la
 * compradora; los cambiados y los nuevos vuelven a decidirse (o se aprueban
 * solos si su tipo es automático); los que ya no vienen se quitan.
 *   actuales: filas de ReclamoLineas [{ LineaId, Posicion, CodigoBarra, Cantidad, Tipo, DescripcionExcel }]
 *   nuevas:   [{ lineaId?, codigoBarra, descripcion, cantidad, tipo }]
 *   esAuto(tipo): si ese tipo se aprueba solo.
 * Devuelve { motivo } si algo no cuadra, o { quitar: [LineaId], cambiar: [...], agregar: [...] }.
 */
export function planCorreccionLineas(actuales, nuevas, esAuto) {
  if (!nuevas.length) return { motivo: { mensaje: 'El reclamo debe tener al menos un producto.', code: 'SIN_PRODUCTOS' } };
  const porId = new Map(actuales.map((l) => [Number(l.LineaId), l]));
  const vistos = new Set();
  const cambiar = [];
  const agregar = [];
  for (const n of nuevas) {
    const fila = { codigoBarra: textoLinea(n.codigoBarra), descripcion: textoLinea(n.descripcion) || null, cantidad: cantidadLinea(n.cantidad), tipo: n.tipo };
    const decision = esAuto(fila.tipo) ? 'aprobado' : 'pendiente';
    if (n.lineaId === undefined || n.lineaId === null) {
      agregar.push({ ...fila, decStatus: decision });
      continue;
    }
    const id = Number(n.lineaId);
    const actual = porId.get(id);
    if (!actual || vistos.has(id)) {
      return { motivo: { mensaje: 'Los productos cambiaron mientras tanto. Recarga el detalle y vuelve a intentarlo.', code: 'PRODUCTOS_CAMBIARON' } };
    }
    vistos.add(id);
    const igual =
      textoLinea(actual.CodigoBarra) === fila.codigoBarra &&
      (textoLinea(actual.DescripcionExcel) || null) === fila.descripcion &&
      cantidadLinea(actual.Cantidad) === fila.cantidad &&
      actual.Tipo === fila.tipo;
    if (!igual) cambiar.push({ ...fila, lineaId: id, decStatus: decision });
  }
  const quitar = actuales.filter((l) => !vistos.has(Number(l.LineaId))).map((l) => Number(l.LineaId));
  return { quitar, cambiar, agregar };
}

// ------------------------------------------------------------------
// Reemplazar el Excel del reclamo (administrador, 2026-11-13).
// ------------------------------------------------------------------

const codigoComparable = (c) => String(c ?? '').trim().replace(/^0+(?=\d)/, '');
const cantidadComparable = (c) => (c === null || c === undefined || c === '' ? '' : String(Number(c)));
const textoComparable = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Cómo se reconoce un producto para comparar el reclamo con un Excel: código,
 * cantidad y motivo. Un sobrante no esperado no trae código en el Excel (Data
 * lo carga después): va por referencia, color y talla.
 */
function claveProductoReclamo(l) {
  const id =
    l.tipo === 'sobrante_no_esperado'
      ? `${textoComparable(l.referencia)} ${textoComparable(l.color)} ${textoComparable(l.talla)}`.trim()
      : codigoComparable(l.codigo);
  return `${id} × ${cantidadComparable(l.cantidad)} (${l.tipo})`;
}

/**
 * Productos del reclamo contra los del Excel, sin importar el orden: lista de
 * diferencias legibles (vacía si cuadran). Cada producto: { codigo, cantidad,
 * tipo, referencia?, color?, talla? }.
 */
export function diferenciasProductosExcel(delReclamo, delExcel) {
  const cuenta = new Map();
  for (const l of delReclamo) cuenta.set(claveProductoReclamo(l), (cuenta.get(claveProductoReclamo(l)) || 0) + 1);
  for (const l of delExcel) cuenta.set(claveProductoReclamo(l), (cuenta.get(claveProductoReclamo(l)) || 0) - 1);
  const dif = [];
  for (const [k, n] of cuenta) {
    if (n > 0) dif.push(`está en el reclamo y no en el Excel: ${k}${n > 1 ? ` (${n} veces)` : ''}`);
    if (n < 0) dif.push(`está en el Excel y no en el reclamo: ${k}${n < -1 ? ` (${-n} veces)` : ''}`);
  }
  return dif;
}

/** Cambiar o quitar el Excel del reclamo (lo hace el administrador): no después de enviarlo a contabilidad. */
export function motivoNoCambiarExcel({ EnviadoContabilidadAt }) {
  if (EnviadoContabilidadAt) return bloqueado('Este reclamo ya se envió a contabilidad; su Excel ya no se puede cambiar.');
  return null;
}

/**
 * Ajustar los productos del reclamo al Excel nuevo (administrador, botón
 * «Reemplazar»; REC-000004, 2026-11-13). Se emparejan por código, cantidad y
 * motivo (claveProductoReclamo):
 *   - los que están en los dos se quedan como están (con su decisión);
 *   - los que solo están en el reclamo se quitan;
 *   - los que solo están en el Excel se agregan (aprobados solos si su motivo
 *     es automático; si no, quedan para que decida la compradora).
 *   actuales: filas de ReclamoLineas; delExcel: [{ codigo, cantidad, tipo, descripcion, referencia, color, talla }]
 * Devuelve { quitar: [filas], agregar: [productos], iguales: n }.
 */
export function planAjusteExcel(actuales, delExcel, esAuto) {
  const libres = new Map();
  for (const l of actuales) {
    const k = claveProductoReclamo({ codigo: l.CodigoBarra, cantidad: l.Cantidad, tipo: l.Tipo, referencia: l.Referencia, color: l.Color, talla: l.Talla });
    if (!libres.has(k)) libres.set(k, []);
    libres.get(k).push(l);
  }
  const agregar = [];
  let iguales = 0;
  for (const n of delExcel) {
    const k = claveProductoReclamo(n);
    const lista = libres.get(k);
    if (lista?.length) {
      lista.shift();
      iguales += 1;
    } else {
      agregar.push({ ...n, decStatus: esAuto(n.tipo) ? 'aprobado' : 'pendiente' });
    }
  }
  const quitar = [...libres.values()].flat();
  return { quitar, agregar, iguales };
}

/** Texto corto de un producto para mostrar el ajuste: «2050039048670 × 2 (sobrante_real)». */
export const textoProductoAjuste = (l) => claveProductoReclamo(l);

/**
 * Estado del reclamo después de ajustar sus productos:
 *   - devuelto: sigue devuelto (quien lo creó lo reenvía);
 *   - con algún producto por decidir: 'pendiente' (la compradora decide);
 *   - todo aprobado y lo había cerrado el sistema (o estaba pendiente o
 *     notificado): lo que tendría al crearlo (cierre automático o notificado);
 *   - cerrado por una persona y nada por decidir: se queda como está.
 * Devuelve { status, decisionSistema } (decisionSistema: true → DecisionBy 'sistema'; false → se limpia; null → no se toca).
 */
export function estadoTrasAjuste({ Status, DecisionBy, Tipo }, lineas, tiposSoloNotificacion) {
  if (Status === STATUS_DEVUELTO) return { status: Status, decisionSistema: null };
  if (lineas.some((l) => l.decStatus === 'pendiente')) return { status: 'pendiente', decisionSistema: false };
  const delSistema = Status === 'pendiente' || Status === 'notificado' || DecisionBy === 'sistema';
  if (!delSistema) return { status: Status, decisionSistema: null };
  const status = estadoAlCrear({ soloNotificacion: esSoloNotificacion({ tipo: Tipo, lineas }, tiposSoloNotificacion), lineas });
  return { status, decisionSistema: status === 'resuelto' ? true : false };
}
