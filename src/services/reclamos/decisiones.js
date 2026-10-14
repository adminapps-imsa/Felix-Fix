// Decisiones de la compradora: por producto y del reclamo completo.
import * as repo from '../../repositories/reclamosRepository.js';
import { TIPOS_AUTO_APROBADOS, esAutoAprobado } from './tipos.js';
import { consultarProductos } from '../sapProductosService.js';
import * as dominio from '../../domain/reclamo.js';
import { conflict, notFound } from '../../utils/httpError.js';
import { obtenerOFallar, exigir, lineasConNombres, nombreUsuario, detalle } from './comun.js';

export async function decidir(token, { status, comentario }, usuario) {
  exigir(dominio.motivoNoDecidir(await obtenerOFallar(token)));
  // El UPDATE vuelve a comprobar estado y líneas pendientes (carrera con un
  // "deshacer" de producto en paralelo).
  const ok = await repo.decidir(token, { status, comentario, usuario: nombreUsuario(usuario) });
  if (!ok) {
    const actual = await obtenerOFallar(token);
    if (actual.Status === 'pendiente' && actual.LineasPendientes > 0) exigir(dominio.motivoLineasPendientes(actual.LineasPendientes));
    throw conflict('El reclamo ya no está pendiente (otro usuario ya lo decidió).');
  }
  return detalle(token);
}

function aLineaDto(l, sap) {
  const prod = sap.productos.get(l.CodigoBarra);
  return {
    ...l,
    Cantidad: l.Cantidad === null ? null : Number(l.Cantidad),
    Descripcion: prod?.descripcion || l.DescripcionExcel || null,
    PrecioVenta: prod?.precioVenta ?? null,
    // null = no se pudo validar (SAP no disponible), distinto de "no encontrado".
    Encontrado: sap.disponible ? Boolean(prod) : null,
    AutoAprobado: esAutoAprobado(l.Tipo),
  };
}

export async function lineas(token) {
  await obtenerOFallar(token);
  const filas = await repo.listarLineas(token);
  const sap = await consultarProductos([...new Set(filas.map((l) => l.CodigoBarra))]);
  return lineasConNombres(filas.map((l) => aLineaDto(l, sap)));
}

async function lineaDecidible(token, posicion) {
  const r = await obtenerOFallar(token);
  const pos = Number(posicion);
  const linea = Number.isInteger(pos) ? await repo.obtenerLinea(token, pos) : null;
  if (!linea) throw notFound('Producto no encontrado en este reclamo.');
  if (esAutoAprobado(linea.Tipo)) {
    throw conflict('Este producto se aprobó automáticamente por su tipo y no se puede decidir manualmente.', {
      code: 'AUTO_APROBADO',
    });
  }
  exigir(dominio.motivoNoCambiarLineas(r));
  return pos;
}

async function lineaActualizada(token, pos) {
  const linea = await repo.obtenerLinea(token, pos);
  const [dto] = await lineasConNombres([aLineaDto(linea, await consultarProductos([linea.CodigoBarra]))]);
  return dto;
}

export async function decidirLinea(token, posicion, { decision, comentario }, usuario) {
  const pos = await lineaDecidible(token, posicion);
  const ok = await repo.actualizarDecisionLinea(token, pos, {
    desde: 'pendiente',
    hacia: decision,
    comentario,
    usuario: nombreUsuario(usuario),
    tiposBloqueados: TIPOS_AUTO_APROBADOS,
  });
  if (!ok) {
    await lineaDecidible(token, pos); // si el reclamo se cerró mientras tanto, da ese motivo
    throw conflict('Este producto ya tiene una decisión. Deshazla primero para cambiarla.');
  }
  return lineaActualizada(token, pos);
}

/**
 * Aprueba o rechaza varios productos de una vez. Los que ya tenían decisión o
 * son de aprobación automática se omiten (no es un error: otro usuario pudo
 * decidirlos mientras tanto). Devuelve todas las líneas actualizadas.
 */
export async function decidirLineas(token, { posiciones, decision, comentario }, usuario) {
  exigir(dominio.motivoNoCambiarLineas(await obtenerOFallar(token)));
  let actualizadas = 0;
  for (const pos of [...new Set(posiciones)]) {
    const ok = await repo.actualizarDecisionLinea(token, pos, {
      desde: 'pendiente',
      hacia: decision,
      comentario,
      usuario: nombreUsuario(usuario),
      tiposBloqueados: TIPOS_AUTO_APROBADOS,
    });
    if (ok) actualizadas += 1;
  }
  return { actualizadas, omitidas: new Set(posiciones).size - actualizadas, lineas: await lineas(token) };
}

export async function deshacerLinea(token, posicion) {
  const pos = await lineaDecidible(token, posicion);
  const ok = await repo.actualizarDecisionLinea(token, pos, {
    desde: 'decidido',
    hacia: 'pendiente',
    comentario: null,
    usuario: null,
    tiposBloqueados: TIPOS_AUTO_APROBADOS,
  });
  if (!ok) {
    await lineaDecidible(token, pos); // si el reclamo se cerró mientras tanto, da ese motivo
    throw conflict('Este producto no tiene una decisión que deshacer.');
  }
  return lineaActualizada(token, pos);
}
