import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/configuracion.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../validators/validate.js';
import { usuariosQuerySchema, permisosRolSchema, asignarRolSchema, bienvenidaSchema } from '../validators/configuracion.schema.js';

const router = Router();

router.use(requireAuth, requirePermiso('configuracion.administrar'));

router.get('/roles', controller.roles);
router.put('/roles/:rol/permisos', validateBody(permisosRolSchema), controller.guardarPermisos);
router.get('/usuarios', validateQuery(usuariosQuerySchema), controller.usuarios);
router.post('/usuarios/:id/roles', validateBody(asignarRolSchema), controller.asignarRol);
router.delete('/usuarios/:id/roles/:rol', controller.quitarRol);
router.get('/auditoria', controller.auditoria);

// Correos: vista previa con datos de ejemplo, prueba al propio correo y bienvenida.
const envioLimiter = rateLimit({ windowMs: 60_000, max: 10, keyGenerator: (req) => req.user?.sub || req.ip, message: { error: 'HttpError', message: 'Demasiados envíos seguidos. Espera un minuto.' } });
router.get('/correos', controller.correos);
router.get('/correos/:id', controller.vistaCorreo);
router.post('/correos/:id/prueba', envioLimiter, controller.enviarPruebaCorreo);
router.post('/correos/bienvenida/enviar', envioLimiter, validateBody(bienvenidaSchema), controller.enviarBienvenida);

export default router;
