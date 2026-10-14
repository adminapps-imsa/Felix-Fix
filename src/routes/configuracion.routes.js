import { Router } from 'express';
import * as controller from '../controllers/configuracion.controller.js';
import { requireAuth, requirePermiso } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../validators/validate.js';
import { usuariosQuerySchema, permisosRolSchema, asignarRolSchema } from '../validators/configuracion.schema.js';

const router = Router();

router.use(requireAuth, requirePermiso('configuracion.administrar'));

router.get('/roles', controller.roles);
router.put('/roles/:rol/permisos', validateBody(permisosRolSchema), controller.guardarPermisos);
router.get('/usuarios', validateQuery(usuariosQuerySchema), controller.usuarios);
router.post('/usuarios/:id/roles', validateBody(asignarRolSchema), controller.asignarRol);
router.delete('/usuarios/:id/roles/:rol', controller.quitarRol);
router.get('/auditoria', controller.auditoria);

export default router;
