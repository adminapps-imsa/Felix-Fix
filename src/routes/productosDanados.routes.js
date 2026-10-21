import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/productosDanados.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { uploadEvidencia, borrarSiFalla } from '../middleware/upload.js';
import { uploadAdjuntoReporte } from '../middleware/uploadReclamos.js';
import { validateBody, validateQuery } from '../validators/validate.js';
import { env } from '../config/env.js';
import { serviceUnavailable } from '../utils/httpError.js';
import { exigirAlcance } from '../services/acceso/alcanceCompradora.js';
import {
  crearReporteSchema,
  corregirReporteSchema,
  devolverATiendaSchema,
  rechazarReporteSchema,
  listarQuerySchema,
  correosSchema,
  cerrarNfSchema,
  documento1700Schema,
  pagoRecibidoSchema,
  adjuntoQuerySchema,
} from '../validators/productosDanados.schema.js';

const router = Router();

// Evita martillar SAP con reintentos rápidos desde el frontend.
const procesarLimiter = rateLimit({ windowMs: 60_000, max: 10 });

router.use(requireAuth);
// Cada compradora solo abre (y trabaja) los reportes de sus marcas: los demás responden 404.
router.param('id', exigirAlcance('reporte'));

// Quien crea o envía al proveedor también ve la lista, el detalle y los KPIs.
const ver = requirePermiso(
  'productos_danados.ver',
  'productos_danados.crear',
  'productos_danados.enviar',
  'productos_danados.aprobar',
  'productos_danados.procesar',
  'productos_danados.eliminar',
  'productos_danados.nf',
  'productos_danados.ver_nf',
  'productos_danados.nf_documento',
  'productos_danados.documentar',
  'productos_danados.pago'
);

// Correos del proveedor y adjuntos: cualquiera que trabaje el reporte.
const editar = requirePermiso('productos_danados.crear', 'productos_danados.aprobar', 'productos_danados.procesar');

router.get('/', ver, validateQuery(listarQuerySchema), controller.listar);
router.get('/kpis', ver, validateQuery(listarQuerySchema), controller.kpis);
router.get('/catalogos', requirePermiso('productos_danados.ver', 'productos_danados.ver_nf', 'productos_danados.crear'), controller.catalogos);
router.get('/:id', ver, controller.detalle);
router.get('/:id/evidencia', ver, controller.evidencia);
router.put('/:id/correos', editar, validateBody(correosSchema), controller.guardarCorreos);

// Envío al proveedor (compradora). Límite para que un doble clic o un error no mande correos de más.
const envioLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: 'HttpError', message: 'Demasiados envíos seguidos. Espera un minuto.' } });
const enviar = requirePermiso('productos_danados.enviar');
router.get('/:id/correo/vista-previa', enviar, controller.vistaPreviaCorreo);
// Tope diario por usuario (además del de cada reporte en el servicio): el correo sale
// del buzón de la empresa hacia afuera y no debe poder usarse para mandar en masa.
const envioDiarioLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  max: 40,
  keyGenerator: (req) => req.user?.sub || req.ip,
  message: { error: 'HttpError', message: 'Llegaste al máximo de envíos al proveedor por hoy. Si necesitas más, avísale al administrador.' },
});
router.post('/:id/correo/enviar', enviar, envioLimiter, envioDiarioLimiter, controller.enviarAlProveedor);
router.post('/:id/adjuntos', editar, uploadAdjuntoReporte, borrarSiFalla, controller.agregarAdjunto);
// `?f=<filename>` (opcional): identifica el adjunto por su nombre en disco, por si la posición cambió.
router.get('/:id/adjuntos/:idx', ver, validateQuery(adjuntoQuerySchema), controller.adjunto);
// Gof también quita sus documentos para contabilidad (el servicio revisa cuál).
router.delete(
  '/:id/adjuntos/:idx',
  requirePermiso('productos_danados.crear', 'productos_danados.aprobar', 'productos_danados.procesar', 'productos_danados.documentar'),
  validateQuery(adjuntoQuerySchema),
  controller.eliminarAdjunto
);

// Después de la respuesta del proveedor.
router.patch('/:id/documento-1700', requirePermiso('productos_danados.nf_documento'), validateBody(documento1700Schema), controller.registrarDocumento1700);
router.patch('/:id/cerrar-nf', requirePermiso('productos_danados.nf'), validateBody(cerrarNfSchema), controller.cerrarNf);
router.post('/:id/documentos-gof', requirePermiso('productos_danados.documentar'), uploadAdjuntoReporte, borrarSiFalla, controller.agregarDocumentoGof);
router.patch('/:id/enviar-contabilidad', requirePermiso('productos_danados.documentar'), controller.enviarAContabilidad);
router.patch('/:id/pago-recibido', requirePermiso('productos_danados.pago'), validateBody(pagoRecibidoSchema), controller.registrarPago);

router.post(
  '/',
  requirePermiso('productos_danados.crear'),
  uploadEvidencia,
  validateBody(crearReporteSchema),
  controller.crear
);

// Devolver a la tienda (compradora, antes de enviarlo al proveedor) y corregirlo
// (quien lo creó o cualquiera con «Crear reportes»): mismo formulario del alta.
router.patch(
  '/:id/devolver-tienda',
  requirePermiso('productos_danados.enviar', 'productos_danados.aprobar'),
  validateBody(devolverATiendaSchema),
  controller.devolverATienda
);
router.put('/:id/corregir', requirePermiso('productos_danados.crear'), uploadEvidencia, validateBody(corregirReporteSchema), controller.corregir);

router.delete('/:id', requirePermiso('productos_danados.eliminar'), controller.eliminar);

router.patch('/:id/aprobar', requirePermiso('productos_danados.aprobar'), controller.aprobar);

router.patch(
  '/:id/rechazar',
  requirePermiso('productos_danados.aprobar'),
  validateBody(rechazarReporteSchema),
  controller.rechazar
);

// Baja en SAP: apagada hasta que la integración exista (SAP_PROCESAR_HABILITADO=true la activa).
const sapHabilitado = (req, res, next) =>
  env.sap.procesarHabilitado ? next() : next(serviceUnavailable('La integración con SAP aún no está disponible.'));
router.post('/:id/procesar', requirePermiso('productos_danados.procesar'), sapHabilitado, procesarLimiter, controller.procesar);

export default router;
