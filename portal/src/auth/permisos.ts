/** Códigos de permiso (deben coincidir con src/services/acceso/permisos.js del backend). */
export const P = {
  pdVer: 'productos_danados.ver',
  pdCrear: 'productos_danados.crear',
  pdEnviar: 'productos_danados.enviar',
  pdAprobar: 'productos_danados.aprobar',
  pdProcesar: 'productos_danados.procesar',
  pdEliminar: 'productos_danados.eliminar',
  pdNf: 'productos_danados.nf',
  pdVerNf: 'productos_danados.ver_nf',
  pdSoloPropios: 'productos_danados.solo_propios',
  pdNfDocumento: 'productos_danados.nf_documento',
  pdDocumentar: 'productos_danados.documentar',
  pdPago: 'productos_danados.pago',
  recVer: 'reclamos.ver',
  recCrear: 'reclamos.crear',
  recAdjuntar: 'reclamos.adjuntar',
  recDecidir: 'reclamos.decidir',
  recContabilidad: 'reclamos.contabilidad',
  recEnviarContabilidad: 'reclamos.enviar_contabilidad',
  recEliminar: 'reclamos.eliminar',
  recSoloTienda: 'reclamos.solo_tienda',
  recRetiro: 'reclamos.retiro_proveedor',
  config: 'configuracion.administrar',
} as const;

/** Quién ve cada módulo en el menú (igual que en las rutas del backend). */
// "Confirmar pago" (pdPago) y "Recibir reclamos en contabilidad" (recContabilidad) se
// trabajan desde el apartado Contabilidad: por sí solos no abren los otros menús.
export const ACCESO_PRODUCTOS = [P.pdVer, P.pdCrear, P.pdEnviar, P.pdAprobar, P.pdProcesar, P.pdEliminar, P.pdNf, P.pdVerNf, P.pdNfDocumento, P.pdDocumentar];
export const ACCESO_RECLAMOS = [P.recVer, P.recCrear, P.recAdjuntar, P.recDecidir, P.recEliminar, P.recEnviarContabilidad, P.recRetiro];
export const ACCESO_CONTABILIDAD = [P.recContabilidad, P.pdPago];
