import { Router } from 'express';
import { getPool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const pool = await getPool();
      await pool.request().query('SELECT 1 AS ok');
      res.json({ status: 'ok', db: 'up' });
    } catch (err) {
      // El detalle (servidor, usuario, etc.) solo al log: /health es público.
      logger.error({ err: err.message }, 'Health check: la base de datos no responde');
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  })
);

export default router;
