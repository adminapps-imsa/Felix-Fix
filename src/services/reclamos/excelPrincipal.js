// Excel del reclamo: el administrador lo reemplaza o lo quita (pedido del
// 2026-11-13). Antes solo se podía con una migración (REC-28, REC-5/6/7).
//
// Reemplazar valida el Excel nuevo antes de tocar nada:
//   1. que sea un Excel y una plantilla completa (mismos mensajes que al crear:
//      qué columna o fila falta, faltantes sin documento, hojas sin títulos);
//   2. que sea de la misma plantilla que el reclamo (Tienda o CEDI);
//   3. que traiga los mismos productos que el reclamo (código, cantidad y
//      motivo, sin importar el orden). Si no, dice cuáles no cuadran.
// Solo cambia el archivo y sus fotos: productos, decisiones y PDF quedan igual.
// No después de enviarlo a contabilidad.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import * as dominio from '../../domain/reclamo.js';
import { tienePermiso, PERMISO_CONFIGURACION } from '../acceso/permisos.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { logger } from '../../utils/logger.js';
import {
  parsearPlantilla,
  FormatoNoReconocidoError,
  PlantillaIncompletaError,
  FechaInvalidaError,
  motivoFaltantesSinDocumento,
  motivoHojasNoReconocidas,
} from './excelParser.js';
import { extraerImagenesExcel, borrarArchivos } from './excelImages.js';
import { resolverTipoLinea } from './tipos.js';
import { obtenerOFallar, tipoRealDeArchivo, exigir, nombreUsuario, detalle } from './comun.js';

const ORIGEN_PRINCIPAL = 'principal';
const ORIGEN_TEXTO = { tienda: 'Tienda', cedi: 'CEDI' };

function exigirAdmin(usuario) {
  if (!tienePermiso(usuario, PERMISO_CONFIGURACION)) throw forbidden('Solo el administrador puede cambiar o quitar el Excel del reclamo.');
}

/** Lee y valida el Excel nuevo contra el reclamo. Devuelve el resultado del parser o lanza 400 con lo que no cuadra. */
async function validarExcelNuevo(r, multerFile) {
  const tipo = await tipoRealDeArchivo(multerFile);
  if (tipo !== 'xlsx' && tipo !== 'xls') throw badRequest('El archivo no es un Excel válido (.xlsx o .xls).');

  let parsed;
  try {
    parsed = parsearPlantilla(await fs.readFile(multerFile.path));
  } catch (err) {
    if (err instanceof FormatoNoReconocidoError) throw badRequest(err.message, { code: 'FORMATO_NO_RECONOCIDO' });
    if (err instanceof PlantillaIncompletaError) throw badRequest(err.message, { code: err.code, faltas: err.faltas });
    if (err instanceof FechaInvalidaError) throw badRequest(err.message, { code: 'FECHA_INVALIDA' });
    throw badRequest('No se pudo leer el Excel. Verifica que no esté dañado ni protegido con contraseña.');
  }
  const sinDocumento = motivoFaltantesSinDocumento(parsed.faltantesSinDocumento);
  if (sinDocumento) throw badRequest(sinDocumento.mensaje, { code: sinDocumento.code });
  const hojaMal = motivoHojasNoReconocidas(parsed.hojasIgnoradas);
  if (hojaMal) throw badRequest(hojaMal.mensaje, { code: hojaMal.code });

  if (parsed.formato !== r.Origen) {
    throw badRequest(
      `El Excel es de la plantilla de ${ORIGEN_TEXTO[parsed.formato] ?? parsed.formato} y el reclamo es de ${ORIGEN_TEXTO[r.Origen] ?? r.Origen}. Sube el Excel de ${ORIGEN_TEXTO[r.Origen] ?? r.Origen}.`,
      { code: 'EXCEL_OTRO_ORIGEN' }
    );
  }

  const delReclamo = (await repo.listarLineas(r.Token)).map((l) => ({
    codigo: l.CodigoBarra,
    cantidad: l.Cantidad,
    tipo: l.Tipo,
    referencia: l.Referencia,
    color: l.Color,
    talla: l.Talla,
  }));
  const delExcel = parsed.lineas.map((l) => ({
    codigo: l.codigoBarra,
    cantidad: l.cantidad,
    // El mismo tipo que se le daría al crearlo (p. ej. una fila sin motivo toma el del reclamo).
    tipo: resolverTipoLinea(l.tipo, r.Tipo),
    referencia: l.referencia,
    color: l.color,
    talla: l.talla,
  }));
  const dif = dominio.diferenciasProductosExcel(delReclamo, delExcel);
  if (dif.length) {
    const max = 10;
    const lista = dif.slice(0, max).map((d) => `• ${d}`).join('\n');
    throw badRequest(
      `El Excel nuevo no trae los mismos productos que el reclamo (${delReclamo.length} en el reclamo, ${delExcel.length} en el Excel):\n${lista}${dif.length > max ? `\n• y ${dif.length - max} más` : ''}\nRevisa el Excel; si el que está mal es el reclamo, corrige primero sus productos.`,
      { code: 'EXCEL_PRODUCTOS_DISTINTOS', diferencias: dif }
    );
  }
  return { tipo, parsed };
}

export async function reemplazarExcel(token, multerFile, usuario) {
  if (!multerFile) throw badRequest('Selecciona el Excel del reclamo.');
  const creados = [multerFile.filename];
  try {
    exigirAdmin(usuario);
    const r = await obtenerOFallar(token);
    exigir(dominio.motivoNoCambiarExcel(r));
    const { tipo, parsed } = await validarExcelNuevo(r, multerFile);

    // Fotos del Excel nuevo (las de averías, por ejemplo): reemplazan a las del anterior.
    let imagenes = [];
    if (tipo === 'xlsx') {
      try {
        imagenes = await extraerImagenesExcel(multerFile.path, ORIGEN_PRINCIPAL);
        creados.push(...imagenes.map((i) => i.filename));
      } catch (err) {
        logger.warn({ err: err.message }, 'No se pudieron extraer las fotos del Excel nuevo del reclamo');
      }
    }

    const nombre = path.basename(multerFile.originalname || '').slice(0, 255) || 'Excel del reclamo.xlsx';
    const res = await repo.cambiarExcelPrincipal(token, { archivo: multerFile.filename, nombre, imagenes }, (fila) => dominio.motivoNoCambiarExcel(fila));
    if (!res) throw notFound('Reclamo no encontrado.');
    exigir(res.bloqueado);
    creados.length = 0; // ya quedaron registrados en la BD

    // Solo después del commit: el Excel anterior y sus fotos ya no se usan.
    await borrarArchivos([res.anterior.archivo, ...res.anterior.imagenes.map((i) => i.filename)].filter(Boolean));
    const dto = await detalle(token);
    logger.info(
      { reclamo: dto.Numero, antes: res.anterior.nombre, ahora: nombre, productos: parsed.lineas.length, usuario: nombreUsuario(usuario) },
      'Excel del reclamo reemplazado'
    );
    return dto;
  } catch (err) {
    await borrarArchivos(creados);
    throw err;
  }
}

export async function quitarExcel(token, usuario) {
  exigirAdmin(usuario);
  const r = await obtenerOFallar(token);
  exigir(dominio.motivoNoCambiarExcel(r));
  if (!r.ArchivoExcel) throw notFound('Este reclamo no tiene Excel.');
  const res = await repo.cambiarExcelPrincipal(token, { archivo: null, nombre: null, imagenes: [] }, (fila) => dominio.motivoNoCambiarExcel(fila));
  if (!res) throw notFound('Reclamo no encontrado.');
  exigir(res.bloqueado);
  await borrarArchivos([res.anterior.archivo, ...res.anterior.imagenes.map((i) => i.filename)].filter(Boolean));
  const dto = await detalle(token);
  logger.info({ reclamo: dto.Numero, archivo: res.anterior.nombre, usuario: nombreUsuario(usuario) }, 'Excel del reclamo quitado');
  return dto;
}
