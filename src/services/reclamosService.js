// Punto de entrada del módulo Reclamos: reúne los casos de uso de
// services/reclamos/ para que el controlador y otros módulos importen de un
// solo lugar. La lógica vive en cada archivo:
//   comun.js              token, lectura del reclamo, DTO y reglas → HTTP
//   consultas.js          permisos, lista, detalle y archivos
//   crear.js              vista previa del Excel/PDF y alta del reclamo
//   decisiones.js         decisiones de la compradora (productos y reclamo)
//   adjuntos.js           adjuntar y quitar archivos, validar la nota de débito
//   envioContabilidad.js  envío por correo a contabilidad
//   eliminar.js           borrar el reclamo completo
//   devolucion.js         devolver a quien lo creó, corregir y reenviar
//   retiro.js             retiro del proveedor en los reclamos de devolución
export { numeroReclamo, detalle } from './reclamos/comun.js';
export { permisos, listar, archivoExcel, imagen, adjunto } from './reclamos/consultas.js';
export {
  ORIGEN_PRINCIPAL,
  MAX_FILAS_FORM,
  previsualizarExcel,
  normalizarDocSap,
  previsualizarPdfSap,
  documentosSapUsados,
  catalogosFormulario,
  relacionProveedor,
  crear,
} from './reclamos/crear.js';
export { decidir, lineas, decidirLinea, decidirLineas, deshacerLinea } from './reclamos/decisiones.js';
export { verificarPuedeAdjuntar, agregarAdjunto, eliminarAdjunto } from './reclamos/adjuntos.js';
export { enviarAContabilidad } from './reclamos/envioContabilidad.js';
export { eliminar } from './reclamos/eliminar.js';
export { devolver, corregirDatos, reenviar } from './reclamos/devolucion.js';
export { registrarRetiro, quitarRetiro, fotoRetiro } from './reclamos/retiro.js';
