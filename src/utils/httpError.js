export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, message, extra);
export const unauthorized = (message = 'No autenticado') => new HttpError(401, message);
export const forbidden = (message = 'No autorizado') => new HttpError(403, message);
export const notFound = (message = 'No encontrado') => new HttpError(404, message);
export const conflict = (message, extra) => new HttpError(409, message, extra);
export const serviceUnavailable = (message, extra) => new HttpError(503, message, extra);
export const badGateway = (message, extra) => new HttpError(502, message, extra);
