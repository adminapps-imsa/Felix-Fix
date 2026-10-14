import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { keycloakCodeSchema } from '../validators/auth.schema.js';

const router = Router();

// Evita martillar el intercambio de código con reintentos rápidos.
const loginLimiter = rateLimit({ windowMs: 60_000, max: 20 });

router.post('/keycloak-code', loginLimiter, validateBody(keycloakCodeSchema), controller.keycloakCode);
router.get('/me', requireAuth, controller.me);
router.get('/vistas', requireAuth, controller.vistas);

export default router;
