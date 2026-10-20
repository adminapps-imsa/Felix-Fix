import * as service from '../services/acceso/configuracionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const roles = asyncHandler(async (req, res) => {
  res.json(await service.roles());
});

export const guardarPermisos = asyncHandler(async (req, res) => {
  res.json(await service.guardarPermisos(req.params.rol, req.body.permisos, req.user));
});

export const usuarios = asyncHandler(async (req, res) => {
  res.json(await service.usuarios(req.query));
});

export const asignarRol = asyncHandler(async (req, res) => {
  await service.asignarRol(req.params.id, req.body.rol, req.user);
  res.status(204).end();
});

export const quitarRol = asyncHandler(async (req, res) => {
  await service.quitarRol(req.params.id, req.params.rol, req.user);
  res.status(204).end();
});

export const auditoria = asyncHandler(async (req, res) => {
  res.json(await service.auditoria());
});

export const correos = asyncHandler(async (req, res) => {
  res.json(service.correos());
});

export const vistaCorreo = asyncHandler(async (req, res) => {
  res.json(service.vistaCorreo(req.params.id));
});

export const enviarPruebaCorreo = asyncHandler(async (req, res) => {
  res.json(await service.enviarPruebaCorreo(req.params.id, req.user));
});

export const enviarBienvenida = asyncHandler(async (req, res) => {
  res.json(await service.enviarBienvenida(req.body.userIds, req.user));
});
