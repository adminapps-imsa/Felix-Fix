import { listarTiendasActivas } from '../repositories/tiendasRepository.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listar = asyncHandler(async (req, res) => {
  res.json(await listarTiendasActivas());
});
