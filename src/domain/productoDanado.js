// Reglas de negocio de un reporte de producto dañado: su ruta de estados y
// qué se puede hacer en cada uno.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Las
// reglas devuelven null si la acción se permite, o el mensaje con el motivo
// si no; el servicio lo traduce al error HTTP que corresponda.
//
// Estados (valor interno → lo que ve el usuario):
//   Pendiente → Aprobado ("Devolución aprobada", Gof) → EnContabilidad → Cerrado
//   Pendiente → Rechazado ("NF", Gof: check documento 1700) → NFValidacion ("NF por validar", supervisor GOF:
//   «Documento salida de NF» y validar) → Cerrado
//   Aprobado → EnProceso → Procesado (baja en SAP; si falla, vuelve a Aprobado)

/** Cada cambio de estado: desde dónde puede salir y a dónde llega. */
export const TRANSICIONES = {
  aprobar: { desde: 'Pendiente', hacia: 'Aprobado' },
  rechazar: { desde: 'Pendiente', hacia: 'Rechazado' },
  registrarDocumento1700: { desde: 'Rechazado', hacia: 'NFValidacion' },
  cerrarNf: { desde: 'NFValidacion', hacia: 'Cerrado' },
  enviarAContabilidad: { desde: 'Aprobado', hacia: 'EnContabilidad' },
  registrarPago: { desde: 'EnContabilidad', hacia: 'Cerrado' },
  marcarEnProceso: { desde: 'Aprobado', hacia: 'EnProceso' },
  marcarProcesado: { desde: 'EnProceso', hacia: 'Procesado' },
  revertirAAprobado: { desde: 'EnProceso', hacia: 'Aprobado' },
};

/** Reporte NF (en cualquier etapa: con Gof, por validar o cerrado). */
export const esNf = (r) => r?.Resolucion === 'NF';

/**
 * Qué reportes ve un usuario. `permisos`: Set de códigos del usuario.
 * Devuelve null (ve todos) o las resoluciones que ve:
 *   - «Ver reportes»: todos.
 *   - «Ver solo los NF» sin «Ver reportes» (Gof): los NF y, si además sube el
 *     documento de las devoluciones («documentar»), las devoluciones aprobadas.
 *     Los pendientes de la compradora no.
 *   - El resto de los roles que trabajan el módulo: todos (como hasta ahora).
 */
export function alcanceVista(permisos) {
  if (permisos.has('productos_danados.ver') || !permisos.has('productos_danados.ver_nf')) return null;
  return permisos.has('productos_danados.documentar') ? ['NF', 'Devolucion'] : ['NF'];
}

export const puedeVerReporte = (alcance, r) => !alcance || alcance.includes(r?.Resolucion);

/** Gof: el check «Documento 1700» debe estar marcado para pasarlo al supervisor GOF. */
export function motivoNoDocumento1700({ confirmado }) {
  return confirmado === true ? null : 'Marca el check «Documento 1700» para confirmar que ya está hecho en SAP.';
}

// «Documento salida de NF»: en SAP es la salida del Almacén NF (almacén 1700
// de cada tienda) con movimiento 551, un documento de material de 10 dígitos.
export const ALMACEN_NF = '1700';
export const MOVIMIENTO_SALIDA_NF = '551';

/** Supervisor GOF: el «Documento salida de NF» es obligatorio y tiene 10 dígitos. */
export function motivoNoValidarNf({ numero }) {
  const n = String(numero ?? '').trim();
  if (!n) return 'Escribe el número del documento salida de NF.';
  if (!/^\d{10}$/.test(n)) return `El documento salida de NF debe tener 10 dígitos (por ejemplo 4904442290). Escribiste «${n}».`;
  return null;
}

/** Mismo código de barras aunque cambien los ceros a la izquierda o los espacios. */
export const mismoCodigo = (a, b) => {
  const n = (v) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');
  return Boolean(n(a)) && n(a) === n(b);
};

/**
 * Valida el «Documento salida de NF» contra SAP y contra los otros reportes.
 * `sap`: resultado de documentoMaterialSap; `repetidoEn`: id del reporte del
 * mismo producto que ya se cerró con ese número (o null).
 * Devuelve { mensaje, code } si no sirve, o { lineas } (las del producto) si sirve.
 */
export function validarDocumentoSalidaNf({ numero, sap, tiendaCodigo, codigoBarras, repetidoEn }) {
  const no = (code, mensaje) => ({ code, mensaje });
  if (repetidoEn) return no('DOC_SALIDA_NF_REPETIDO', `El documento ${numero} ya se usó para cerrar el reporte #${repetidoEn} del mismo producto.`);
  if (!sap?.disponible) return no('SAP_NO_DISPONIBLE', 'No se pudo consultar SAP para validar el documento salida de NF. Intenta de nuevo en unos minutos.');
  if (!sap.encontrado) return no('DOC_SALIDA_NF_NO_EXISTE', `El documento ${numero} no existe en SAP.`);
  const salidas = sap.lineas.filter((l) => l.bwart === MOVIMIENTO_SALIDA_NF && l.lgort === ALMACEN_NF);
  if (!salidas.length) {
    return no('DOC_SALIDA_NF_NO_ES_SALIDA', `El documento ${numero} no es una salida del Almacén NF (movimiento ${MOVIMIENTO_SALIDA_NF} desde el almacén ${ALMACEN_NF}).`);
  }
  if (!String(codigoBarras ?? '').trim()) {
    return no('DOC_SALIDA_NF_SIN_CODIGO', 'El reporte no tiene código de barras: no se puede comprobar que el documento sea del mismo producto.');
  }
  if (!sap.matnr) return no('DOC_SALIDA_NF_PRODUCTO_NO_SAP', `El código de barras ${codigoBarras} del reporte no existe en SAP: no se puede comprobar el producto.`);
  const delProducto = salidas.filter((l) => l.matnr === sap.matnr);
  if (!delProducto.length) return no('DOC_SALIDA_NF_OTRO_PRODUCTO', `El documento ${numero} no trae este producto (código de barras ${codigoBarras}).`);
  const enTienda = tiendaCodigo ? delProducto.filter((l) => l.werks === tiendaCodigo) : delProducto;
  if (!enTienda.length) {
    const tiendas = [...new Set(delProducto.map((l) => l.werks))].join(', ');
    return no('DOC_SALIDA_NF_OTRA_TIENDA', `El documento ${numero} es de la tienda ${tiendas} y el reporte es de ${tiendaCodigo}.`);
  }
  return { lineas: enTienda };
}

// Correos del proveedor y adjuntos para el proveedor: solo antes de que el reporte siga a contabilidad/NF.
export const ESTADOS_EDITABLES = ['Pendiente', 'Aprobado'];

export const MSG_NO_EDITABLE = 'Los correos y adjuntos para el proveedor solo se pueden cambiar mientras el reporte está Pendiente o Aprobado.';

export const motivoNoEditable = (estado) => (ESTADOS_EDITABLES.includes(estado) ? null : MSG_NO_EDITABLE);

/** Documento que sube Gof para contabilidad (no va al proveedor). */
export const esDocGof = (adjunto) => adjunto?.etapa === 'gof';

/** Agregar un adjunto: los de Gof solo con el reporte en Gof; los del proveedor, mientras sea editable. */
export function motivoNoAgregarAdjunto(estado, { gof = false } = {}) {
  if (gof) return estado === TRANSICIONES.enviarAContabilidad.desde ? null : 'Solo se suben documentos para contabilidad mientras el reporte está con Gof.';
  return motivoNoEditable(estado);
}

/** Quitar un adjunto: el documento de Gof ya enviado a contabilidad (o cerrado) queda como registro. */
export function motivoNoEliminarAdjunto(estado, adjunto) {
  if (esDocGof(adjunto)) {
    return estado === TRANSICIONES.enviarAContabilidad.desde ? null : 'El documento ya se envió a contabilidad y no se puede eliminar.';
  }
  return motivoNoEditable(estado);
}

/** Gof envía a contabilidad solo con al menos un documento suyo subido. */
export function motivoNoEnviarContabilidad(adjuntos) {
  return adjuntos.some(esDocGof) ? null : 'Sube al menos un documento (PDF o Excel) antes de enviarlo a contabilidad.';
}

// Lo que ya está en contabilidad, cerrado o dado de baja en SAP queda como registro.
const NO_ELIMINABLE = {
  Procesado: 'Este reporte ya se dio de baja en SAP y no se puede eliminar.',
  EnProceso: 'Este reporte se está procesando en SAP; no se puede eliminar ahora.',
  EnContabilidad: 'Este reporte ya está en contabilidad y no se puede eliminar.',
  Cerrado: 'Este reporte ya está cerrado y no se puede eliminar.',
};

export const ESTADOS_NO_ELIMINABLES = Object.keys(NO_ELIMINABLE);

export const motivoNoEliminar = (estado) => NO_ELIMINABLE[estado] || null;

export const MSG_NO_ENVIABLE = 'El reporte solo se puede enviar al proveedor mientras está Pendiente.';

export const motivoNoEnviarProveedor = (estado) => (estado === 'Pendiente' ? null : MSG_NO_ENVIABLE);

/*
 * Topes de reenvío al proveedor: el correo sale del buzón de la empresa a
 * direcciones externas, así que no se puede mandar en bucle (spam o abuso).
 * Alcanza para reenviar si el proveedor no respondió o se corrigió un correo.
 */
export const MAX_ENVIOS_PROVEEDOR = 5;
export const ESPERA_REENVIO_MIN = 10;

/** Por qué no se puede (re)enviar todavía, o null si se puede. */
export function bloqueoReenvio(r, ahora = Date.now()) {
  if ((r.EnviosProveedor || 0) >= MAX_ENVIOS_PROVEEDOR) {
    return `Este reporte ya se envió ${MAX_ENVIOS_PROVEEDOR} veces al proveedor, el máximo permitido. Si el proveedor no responde, contáctalo directamente desde tu correo.`;
  }
  if (r.EnviadoProveedorAt) {
    const minutos = (ahora - new Date(r.EnviadoProveedorAt).getTime()) / 60_000;
    if (minutos < ESPERA_REENVIO_MIN) {
      const faltan = Math.max(1, Math.ceil(ESPERA_REENVIO_MIN - minutos));
      return `Se acaba de enviar este reporte. Podrás reenviarlo en ${faltan} minuto${faltan === 1 ? '' : 's'}.`;
    }
  }
  return null;
}
