import * as service from '../services/tableroService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const obtener = asyncHandler(async (req, res) => {
  res.json(await service.obtenerTablero(req.query, req.user));
});
