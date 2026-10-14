/**
 * Integración de baja de inventario en SAP — NO IMPLEMENTADA TODAVÍA.
 *
 * Esta función es el ÚNICO punto de contacto entre el módulo de Productos
 * Dañados y SAP. Toda la lógica de negocio del módulo (transición de
 * estados, auditoría, reintentos) ya está resuelta alrededor de esta función
 * en productosDanadosService.js — lo único que falta es completar el cuerpo
 * de darDeBajaInventario() con la integración real.
 *
 * Antes de completarla hace falta que el cliente confirme:
 *
 *   1. Mecanismo real: ¿INSERT a una tabla de staging que un job/n8n de SAP
 *      consume, o llamada directa a un RFC/BAPI (ej. BAPI_GOODSMVT_CREATE)?
 *   2. Si es tabla de staging: nombre y esquema exactos, y qué columnas
 *      espera (¿ya existe una convención para otras integraciones vía n8n?).
 *   3. Código de movimiento de inventario (Bewegungsart / movement type) que
 *      corresponde a cada motivo de este módulo:
 *        Deterioro        -> ?
 *        Dano              -> ?
 *        Vencimiento       -> ?
 *        CambioDevolucion  -> ?
 *   4. Credenciales y connect string de Oracle en formato thin mode
 *      (host:puerto/service_name) — hoy son placeholders vacíos en .env.example
 *      (SAP_ORACLE_USER, SAP_ORACLE_PASSWORD, SAP_ORACLE_CONNECT_STRING).
 *   5. Cómo se identifica de forma única una baja ya registrada en SAP, para
 *      poder deduplicar reintentos usando `idempotencyKey` (ver abajo) — sin
 *      esto, reintentar tras un fallo de red podría duplicar la baja.
 *
 * Contrato que debe respetar la implementación real:
 *   - Recibe { reporteId, sku, cantidad, motivo, tiendaCodigo, idempotencyKey }.
 *   - Devuelve { sapDocumentoId } en éxito.
 *   - Lanza SapBajaError en cualquier fallo controlado (SAP rechazó el
 *     movimiento, timeout, etc.) — productosDanadosService.js captura esa
 *     excepción, revierte el reporte a "Aprobado" y deja auditado el intento
 *     fallido para poder reintentar. Nunca debe dejar el reporte marcado
 *     como "Procesado" si esta función no confirma éxito.
 *   - Debe respetar SAP_ORACLE_TIMEOUT_MS para no colgar la petición HTTP.
 */

export class SapNoImplementadoError extends Error {
  constructor() {
    super(
      'La integración de baja de inventario en SAP todavía no está implementada. ' +
        'Ver comentario en src/services/sapBajaService.js para lo que falta definir.'
    );
    this.name = 'SapNoImplementadoError';
  }
}

export class SapBajaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SapBajaError';
  }
}

// eslint-disable-next-line no-unused-vars
export async function darDeBajaInventario({ reporteId, sku, cantidad, motivo, tiendaCodigo, idempotencyKey }) {
  throw new SapNoImplementadoError();
}
