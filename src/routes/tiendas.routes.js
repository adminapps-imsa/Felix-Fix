import { Router } from 'express';
import * as controller from '../controllers/tiendas.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.get('/', controller.listar);

export default router;
