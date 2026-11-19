import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as controller from '../controllers/contabilidad.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../validators/validate.js';
import { uploadRespuestaProveedor, uploadAdjuntosCorreo, MAX_ADJUNTOS_CORREO } from '../middleware/uploadReclamos.js';

const router = Router();

// Bandeja de contabilidad: solo quien recibe los reclamos en contabilidad
// (el super administrador tiene todos los permisos).
router.use(requireAuth, requirePermiso('reclamos.contabilidad'));

const listarDocumentosQuerySchema = z.object({
  estado: z.enum(['pendiente', 'aprobado', 'no_aprobado', 'no_reclamado', 'todos']).optional().or(z.literal('')),
  q: z.string().max(200).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

router.get('/documentos', validateQuery(listarDocumentosQuerySchema), controller.listar);
router.get('/documentos/:id', controller.detalle);

// Envío de la nota de débito al proveedor: correos escritos por contabilidad y un comentario que va en el correo.
const correosSchema = z
  .array(z.string().trim().toLowerCase().email('Correo inválido.').max(254))
  .max(20, 'Máximo 20 correos.')
  .transform((c) => [...new Set(c)]);
const comentarioSchema = z.string().max(2000, 'El comentario puede tener hasta 2000 caracteres.').optional().default('');
// Vista previa (JSON): de los archivos extra solo van nombre y tamaño.
const vistaPreviaSchema = z.object({
  correos: correosSchema,
  comentario: comentarioSchema,
  adjuntos: z
    .array(z.object({ nombre: z.string().max(255), size: z.number().nonnegative() }))
    .max(MAX_ADJUNTOS_CORREO, `Máximo ${MAX_ADJUNTOS_CORREO} archivos.`)
    .optional()
    .default([]),
});
router.post('/documentos/:id/correo-proveedor/vista-previa', validateBody(vistaPreviaSchema), controller.vistaPreviaProveedor);
const envioLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: 'HttpError', message: 'Demasiados envíos seguidos. Espera un minuto.' } });
// Enviar (multipart): correos (JSON), comentario y los archivos extra en «adjuntos». Se valida en el
// controlador para borrar los archivos subidos si algo no cuadra.
router.post('/documentos/:id/correo-proveedor/enviar', envioLimiter, uploadAdjuntosCorreo, controller.enviarProveedor);


// Respuesta del proveedor: aprobado o no aprobado, con el registro SAP (obligatorio) y el documento SAP (opcional).
// Campos del formulario: respuesta, registroSap y el archivo («archivo»); las reglas las revisa el servicio.
router.post('/documentos/:id/respuesta', uploadRespuestaProveedor, controller.registrarRespuesta);
router.delete('/documentos/:id/respuesta', controller.quitarRespuesta);
router.get('/documentos/:id/respuesta/archivo', controller.archivoRespuesta);

// Contabilidad decide si se reclama al proveedor; «no reclamar» lleva motivo.
const decisionSchema = z.object({
  decision: z.enum(['reclamar', 'no_reclamar'], { errorMap: () => ({ message: 'Elige si se reclama o no al proveedor.' }) }),
  comentario: z.string().max(2000, 'El motivo puede tener hasta 2000 caracteres.').optional().default(''),
});
router.post('/documentos/:id/decision', validateBody(decisionSchema), controller.decidir);
router.delete('/documentos/:id/decision', controller.quitarDecision);


export default router;
