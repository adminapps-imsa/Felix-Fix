import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/tablero.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validateQuery } from '../validators/validate.js';

const router = Router();

// Cualquiera que trabaje algún módulo; el servicio arma solo las secciones de sus permisos.
router.use(
  requireAuth,
  requirePermiso(
    'productos_danados.ver', 'productos_danados.crear', 'productos_danados.enviar', 'productos_danados.aprobar',
    'productos_danados.procesar', 'productos_danados.eliminar', 'productos_danados.nf', 'productos_danados.ver_nf',
    'productos_danados.nf_documento', 'productos_danados.documentar', 'productos_danados.pago',
    'reclamos.ver', 'reclamos.crear', 'reclamos.adjuntar', 'reclamos.decidir', 'reclamos.eliminar',
    'reclamos.enviar_contabilidad', 'reclamos.contabilidad'
  )
);

const querySchema = z.object({ dias: z.enum(['7', '30', '90', '365']).optional() });

router.get('/', validateQuery(querySchema), controller.obtener);

export default router;
