// Retiro del proveedor en los reclamos de devolución: Gof marca que el
// proveedor ya se llevó el producto, con la foto y el día. Solo deja
// constancia: no cambia el estado ni las decisiones del reclamo.
// Regla: dominio.motivoNoRegistrarRetiro.
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import * as dominio from '../../domain/reclamo.js';
import { diaPanama } from '../../domain/tablero.js';
import { borrarArchivos, CONTENT_TYPE_IMAGEN } from './excelImages.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import { obtenerOFallar, validarToken, exigir, nombreUsuario, detalle, tipoRealDeArchivo } from './comun.js';

export async function registrarRetiro(token, { fecha }, foto, usuario) {
  validarToken(token);
  const creados = foto ? [foto.filename] : [];
  try {
    // La foto se revisa por su contenido (firma del archivo), no por lo que dice el navegador.
    if (foto && (await tipoRealDeArchivo(foto)) !== 'imagen') throw badRequest('La foto del retiro debe ser una imagen JPG, PNG o WEBP.');
    const res = await repo.registrarRetiro(token, { fecha, foto: foto?.filename, usuario: nombreUsuario(usuario) }, (fila) =>
      dominio.motivoNoRegistrarRetiro(fila, { fecha, tieneFoto: Boolean(foto), hoy: diaPanama(new Date()) })
    );
    if (!res) throw notFound('Reclamo no encontrado.');
    exigir(res.bloqueado);
    creados.length = 0;
    // La foto anterior (si se corrigió el retiro) se borra después del commit.
    if (res.fotoAnterior) await borrarArchivos([res.fotoAnterior]);
    const dto = await detalle(token);
    logger.info({ reclamo: dto.Numero, fecha, usuario: nombreUsuario(usuario) }, 'Retiro del proveedor registrado');
    return dto;
  } catch (err) {
    await borrarArchivos(creados);
    throw err;
  }
}

export async function quitarRetiro(token, usuario) {
  validarToken(token);
  const res = await repo.quitarRetiro(token);
  if (!res) throw notFound('Reclamo no encontrado.');
  if (res.foto) await borrarArchivos([res.foto]);
  const dto = await detalle(token);
  logger.info({ reclamo: dto.Numero, usuario: nombreUsuario(usuario) }, 'Retiro del proveedor quitado');
  return dto;
}

export async function fotoRetiro(token) {
  const r = await obtenerOFallar(token);
  if (!r.RetiroProveedorFoto) throw notFound('Este reclamo no tiene foto del retiro.');
  const ext = path.extname(r.RetiroProveedorFoto).slice(1).toLowerCase().replace('jpeg', 'jpg');
  return { ruta: reclamoArchivoPath(r.RetiroProveedorFoto), contentType: CONTENT_TYPE_IMAGEN[ext] || 'application/octet-stream', nombre: `Retiro ${r.ReclamoId}.${ext}` };
}
