// Reglas de negocio de un reporte de producto dañado: su ruta de estados y
// qué se puede hacer en cada uno.
//
// Módulo puro: no conoce la base de datos, HTTP, Keycloak ni el disco. Las
// reglas devuelven null si la acción se permite, o el mensaje con el motivo
// si no; el servicio lo traduce al error HTTP que corresponda.
//
// Estados (valor interno → lo que ve el usuario):
//   Pendiente → Aprobado ("Devolución aprobada", Gof) → EnContabilidad → Cerrado
//   Pendiente → Rechazado ("NF", supervisor GOF) → Cerrado
//   Aprobado → EnProceso → Procesado (baja en SAP; si falla, vuelve a Aprobado)

/** Cada cambio de estado: desde dónde puede salir y a dónde llega. */
export const TRANSICIONES = {
  aprobar: { desde: 'Pendiente', hacia: 'Aprobado' },
  rechazar: { desde: 'Pendiente', hacia: 'Rechazado' },
  cerrarNf: { desde: 'Rechazado', hacia: 'Cerrado' },
  enviarAContabilidad: { desde: 'Aprobado', hacia: 'EnContabilidad' },
  registrarPago: { desde: 'EnContabilidad', hacia: 'Cerrado' },
  marcarEnProceso: { desde: 'Aprobado', hacia: 'EnProceso' },
  marcarProcesado: { desde: 'EnProceso', hacia: 'Procesado' },
  revertirAAprobado: { desde: 'EnProceso', hacia: 'Aprobado' },
};

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
