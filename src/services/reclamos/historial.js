// Historial de un reclamo (administrador y supervisor GOF): qué pasó, quién,
// cuándo y cuánto tardó. Regla en src/domain/historialReclamo.js.
import * as repo from '../../repositories/reclamosRepository.js';
import { delReclamo } from '../../repositories/bitacoraRepository.js';
import { armarHistorial } from '../../domain/historialReclamo.js';
import { nombresDeUsuarios } from '../acceso/keycloakAdmin.js';
import { obtenerOFallar } from './comun.js';
import { logger } from '../../utils/logger.js';

export async function historial(token) {
  const r = await obtenerOFallar(token);
  const [comentarios, lineas, bitacora] = await Promise.all([
    repo.listarComentarios(r.ReclamoId),
    repo.listarLineas(r.Token),
    // Sin bitácora (tabla nueva) el historial sale igual, con lo que hay en el reclamo.
    delReclamo(r.Token).catch((err) => {
      logger.warn({ err: err.message }, 'No se pudo leer la bitácora para el historial del reclamo');
      return [];
    }),
  ]);
  const { eventos, resumen } = armarHistorial({ reclamo: r, comentarios, lineas, bitacora });
  const nombres = await nombresDeUsuarios(eventos.map((e) => e.usuario).filter(Boolean));
  return {
    eventos: eventos.map((e) => ({ ...e, usuarioNombre: e.usuario ? nombres.get(e.usuario) || e.usuario : null })),
    resumen,
  };
}
