import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/contabilidad.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validateQuery } from '../validators/validate.js';

const router = Router();

// Bandeja de contabilidad: solo quien recibe los reclamos en contabilidad
// (el super administrador tiene todos los permisos).
router.use(requireAuth, requirePermiso('reclamos.contabilidad'));

const listarDocumentosQuerySchema = z.object({
  estado: z.enum(['pendiente', 'todos']).optional().or(z.literal('')),
  q: z.string().max(200).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

router.get('/documentos', validateQuery(listarDocumentosQuerySchema), controller.listar);
router.get('/documentos/:id', controller.detalle);

export default router;
