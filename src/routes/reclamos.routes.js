import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/reclamos.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { uploadExcelReclamo, uploadExcelPreview, uploadPdfPreview, uploadAdjuntoReclamo } from '../middleware/uploadReclamos.js';
import { validateBody, validateQuery } from '../validators/validate.js';
import { decisionReclamoSchema, decisionLineaSchema, decisionLineasSchema, listarQuerySchema, proveedorQuerySchema } from '../validators/reclamos.schema.js';

const router = Router();

// Cualquier permiso de Reclamos incluye verlos (no se puede crear ni decidir
// lo que no se ve). Crear, decidir y eliminar se exigen en cada ruta.
router.use(requireAuth, requirePermiso('reclamos.ver', 'reclamos.crear', 'reclamos.adjuntar', 'reclamos.decidir', 'reclamos.eliminar', 'reclamos.contabilidad', 'reclamos.enviar_contabilidad'));
const crear = requirePermiso('reclamos.crear');
const decidir = requirePermiso('reclamos.decidir');
const eliminar = requirePermiso('reclamos.eliminar');
// Envían a contabilidad solo quienes tienen el permiso propio (Gof, Torre de Control); la compradora no.
const enviarContabilidad = requirePermiso('reclamos.enviar_contabilidad');
// Envío a contabilidad: límite para que un doble clic no mande correos de más.
const envioLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: 'HttpError', message: 'Demasiados envíos seguidos. Espera un minuto.' } });
// Leer y crear con Excel es lo más pesado de la API: tope por usuario (no por IP: varias
// tiendas pueden salir por la misma IP) para que nadie la sature subiendo archivos en bucle.
const excelLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req) => req.user?.sub || req.ip,
  message: { error: 'HttpError', message: 'Demasiados archivos seguidos. Espera un minuto.' },
});

router.get('/', validateQuery(listarQuerySchema), controller.listar);
router.get('/permisos', controller.permisos);
router.get('/catalogos', controller.catalogos);
router.get('/proveedor', validateQuery(proveedorQuerySchema), controller.proveedor);
router.post('/parse-excel', crear, excelLimiter, uploadExcelPreview, controller.parseExcel);
router.post('/parse-pdf', crear, excelLimiter, uploadPdfPreview, controller.parsePdf);
router.post('/', crear, excelLimiter, uploadExcelReclamo, controller.crear);

router.get('/:token', controller.detalle);
router.get('/:token/excel', controller.excel);
router.patch('/:token/decision', decidir, validateBody(decisionReclamoSchema), controller.decidir);
router.delete('/:token', eliminar, controller.eliminar);
router.post('/:token/enviar-contabilidad', enviarContabilidad, envioLimiter, controller.enviarAContabilidad);

router.get('/:token/lineas', controller.lineas);
router.post('/:token/lineas/decision', decidir, validateBody(decisionLineasSchema), controller.decidirLineas);
router.post('/:token/lineas/:pos/decision', decidir, validateBody(decisionLineaSchema), controller.decidirLinea);
router.delete('/:token/lineas/:pos/decision', decidir, controller.deshacerLinea);

router.get('/:token/imagen/:idx', controller.imagen);

// Agregar: quien decide o tiene "Adjuntar en cualquier reclamo", o quien creó el reclamo. El permiso se
// valida antes de multer (para no guardar el archivo) y otra vez en el servicio.
router.post('/:token/adjuntos', controller.permisoAdjuntar, uploadAdjuntoReclamo, controller.agregarAdjunto);
router.get('/:token/adjuntos/:idx', controller.adjunto);
router.delete('/:token/adjuntos/:idx', eliminar, controller.eliminarAdjunto);

export default router;
