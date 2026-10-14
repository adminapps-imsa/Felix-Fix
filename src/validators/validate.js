import { badRequest } from '../utils/httpError.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(badRequest('Datos inválidos.', { detalles: result.error.flatten() }));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(badRequest('Parámetros de consulta inválidos.', { detalles: result.error.flatten() }));
    }
    req.query = { ...req.query, ...result.data };
    next();
  };
}
