import * as service from '../services/contabilidad/contabilidadService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(await service.listar(req.query));
});

export const detalle = asyncHandler(async (req, res) => {
  res.json(await service.detalle(req.params.id));
});
