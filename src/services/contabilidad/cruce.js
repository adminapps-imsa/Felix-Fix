// Cruce de las filas de un PDF (nota de débito 911/912) con los productos del
// reclamo. Manda el código de barras (2026-11-19): se buscan en SAP los
// materiales de los códigos de barras del reclamo y cada fila se cruza primero
// por material; la descripción del Excel queda de respaldo. Si SAP no responde,
// queda el cruce por descripción.
import { cruzar } from './validarDocumento.js';
import { materialesDeCodigos } from '../sapProductosService.js';

export async function cruzarConSap(filas, lineasReclamo) {
  const conMaterial = (filas || []).some((f) => f.material);
  const codigos = (lineasReclamo || []).map((l) => l.CodigoBarra).filter(Boolean);
  if (!conMaterial || !codigos.length) return cruzar(filas, lineasReclamo);
  const sap = await materialesDeCodigos(codigos);
  return cruzar(filas, lineasReclamo, sap.disponible ? sap.materiales : new Map());
}
