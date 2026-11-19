// Reglas de la bandeja de contabilidad (documentos de reclamos).
//
// Primero contabilidad decide si se le reclama al proveedor (2026-11-18):
//   pendiente --(no reclamar + motivo)--> no_reclamado (cerrado)
//   pendiente --(reclamar)--> sigue pendiente, con «Enviar al proveedor» y «Respuesta del proveedor»
//   la decisión se quita si fue un error (no después de enviarlo al proveedor ni con respuesta).
//
// Respuesta del proveedor a la nota de débito (2026-11-18):
//   pendiente --(aprobado: n.º de nota de crédito + documento opcional)-> aprobado
//   pendiente --(no aprobado: registro SAP + documento SAP opcional)-> no_aprobado
//   aprobado / no_aprobado --(quitar, si fue un error)----------> pendiente

export const RESPUESTAS = ['aprobado', 'no_aprobado'];
export const DECISIONES = ['reclamar', 'no_reclamar'];

export const MOTIVO_SIN_RECLAMAR = { mensaje: 'Primero marca «Reclamar» para este documento.', code: 'SIN_RECLAMAR' };
export const ETIQUETA_RESPUESTA = { aprobado: 'Aprobado por el proveedor', no_aprobado: 'No aprobado por el proveedor' };

/**
 * Número que pide cada respuesta (se guarda en RegistroSap): aprobado, el de la
 * nota de crédito; no aprobado, el de registro SAP (2026-11-19).
 */
export const NOMBRE_NUMERO = { aprobado: 'número de nota de crédito', no_aprobado: 'número de registro SAP' };

/** Número de registro SAP o de nota de crédito: solo dígitos y letras, de 4 a 20. */
const REGISTRO_SAP_RE = /^[A-Z0-9-]{4,20}$/i;

/**
 * Motivo por el que no se puede registrar la respuesta (o null).
 * `documento`: { Estado, DecisionConta }. `datos`: { respuesta, registroSap }.
 */
export function motivoNoResponder(documento, { respuesta, registroSap }) {
  if (documento.DecisionConta !== 'reclamar') return MOTIVO_SIN_RECLAMAR;
  if (documento.Estado !== 'pendiente') return { mensaje: 'Este documento ya tiene la respuesta del proveedor; quítala primero si fue un error.', code: 'YA_RESPONDIDO' };
  if (!RESPUESTAS.includes(respuesta)) return { mensaje: 'Elige si el proveedor aprobó o no.', code: 'RESPUESTA_INVALIDA' };
  // El número es obligatorio (nota de crédito si aprobó, registro SAP si no); el documento es opcional (2026-11-19).
  const nombre = NOMBRE_NUMERO[respuesta];
  const n = String(registroSap ?? '').trim();
  if (!n) return { mensaje: `Escribe el ${nombre}.`, code: 'FALTA_REGISTRO_SAP' };
  if (!REGISTRO_SAP_RE.test(n)) return { mensaje: `El ${nombre} no es válido («${n}»): solo números y letras, de 4 a 20.`, code: 'REGISTRO_SAP_INVALIDO' };
  return null;
}

export function motivoNoQuitarRespuesta(documento) {
  return documento.Estado === 'pendiente' ? { mensaje: 'Este documento todavía no tiene respuesta del proveedor.', code: 'SIN_RESPUESTA' } : null;
}

/** Reclamar o no al proveedor: solo una vez, con el documento pendiente; «no reclamar» lleva motivo. */
export function motivoNoDecidir(documento, { decision, comentario }) {
  if (documento.DecisionConta) return { mensaje: 'Este documento ya tiene la decisión de contabilidad; quítala primero si fue un error.', code: 'YA_DECIDIDO' };
  if (documento.Estado !== 'pendiente') return { mensaje: 'Este documento ya no está pendiente.', code: 'NO_PENDIENTE' };
  if (!DECISIONES.includes(decision)) return { mensaje: 'Elige si se reclama o no al proveedor.', code: 'DECISION_INVALIDA' };
  if (decision === 'no_reclamar' && !String(comentario ?? '').trim()) return { mensaje: 'Escribe por qué no se reclama.', code: 'FALTA_MOTIVO' };
  return null;
}

/** Quitar la decisión: no si ya se envió al proveedor o ya tiene su respuesta. */
export function motivoNoQuitarDecision(documento) {
  if (!documento.DecisionConta) return { mensaje: 'Este documento todavía no tiene decisión.', code: 'SIN_DECISION' };
  if (documento.Estado === 'aprobado' || documento.Estado === 'no_aprobado') return { mensaje: 'Ya tiene la respuesta del proveedor; quítala primero.', code: 'CON_RESPUESTA' };
  if (documento.EnviadoProveedorAt) return { mensaje: 'Ya se envió al proveedor; la decisión no se puede quitar.', code: 'YA_ENVIADO' };
  return null;
}

/** Enviar al proveedor: solo si se decidió reclamar y no tiene respuesta todavía. */
export function motivoNoEnviarProveedor(documento) {
  if (documento.DecisionConta !== 'reclamar') return MOTIVO_SIN_RECLAMAR;
  if (documento.Estado !== 'pendiente') return { mensaje: 'Este documento ya tiene la respuesta del proveedor.', code: 'YA_RESPONDIDO' };
  return null;
}
