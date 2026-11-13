// Excel del reclamo: el administrador lo reemplaza o lo quita (pedido del
// 2026-11-13). Antes solo se podía con una migración (REC-28, REC-5/6/7).
//
// Reemplazar valida el Excel nuevo antes de tocar nada:
//   1. que sea un Excel y una plantilla completa (mismos mensajes que al crear:
//      qué columna o fila falta, faltantes sin documento, hojas sin títulos);
//   2. que sea de la misma plantilla que el reclamo (Tienda o CEDI);
//   3. que traiga los mismos productos que el reclamo (código, cantidad y
//      motivo, sin importar el orden). Si es así, solo cambia el archivo y sus fotos.
// Si los productos no cuadran (REC-000004, 2026-11-13) responde 409 con lo
// que cambiaría (`ajuste`), y con `ajustar` el reclamo se ajusta al Excel:
// se quitan los que ya no vienen, se agregan los nuevos (los faltantes deben
// estar en los 911 del reclamo) y el estado se recalcula (estadoTrasAjuste).
// Los que no cambian conservan su decisión. No después de contabilidad.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import * as dominio from '../../domain/reclamo.js';
import { tienePermiso, PERMISO_CONFIGURACION } from '../acceso/permisos.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError.js';
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
import { resolverTipoLinea, esAutoAprobado, COMENTARIO_AUTO_APROBADO, USUARIO_SISTEMA, TIPOS_SOLO_NOTIFICACION } from './tipos.js';
import { obtenerOFallar, tipoRealDeArchivo, exigir, nombreUsuario, detalle } from './comun.js';
import { exigirFaltantesEn911 } from './crear.js';
import { leerNotaPdf } from '../contabilidad/leerNotaPdf.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';

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

  const actuales = await repo.listarLineas(r.Token);
  const delReclamo = actuales.map((l) => ({
    codigo: l.CodigoBarra,
    cantidad: l.Cantidad,
    tipo: l.Tipo,
    referencia: l.Referencia,
    color: l.Color,
    talla: l.Talla,
  }));
  const delExcel = parsed.lineas.map((l) => ({
    codigo: l.codigoBarra,
    codigoBarra: l.codigoBarra || null,
    cantidad: l.cantidad,
    // El mismo tipo que se le daría al crearlo (p. ej. una fila sin motivo toma el del reclamo).
    tipo: resolverTipoLinea(l.tipo, r.Tipo),
    descripcion: l.descripcion,
    referencia: l.referencia,
    color: l.color,
    talla: l.talla,
  }));
  const dif = dominio.diferenciasProductosExcel(delReclamo, delExcel);
  return { tipo, parsed, actuales, delExcel, iguales: dif.length === 0 };
}

/** Lo que cambiaría al ajustar el reclamo al Excel, para mostrarlo antes de confirmar. */
function resumenAjuste(r, actuales, plan) {
  const quedan = actuales.filter((l) => !plan.quitar.includes(l));
  const lineas = [...quedan.map((l) => ({ tipo: l.Tipo, decStatus: l.DecStatus })), ...plan.agregar.map((l) => ({ tipo: l.tipo, decStatus: l.decStatus }))];
  const estado = dominio.estadoTrasAjuste(r, lineas, TIPOS_SOLO_NOTIFICACION);
  return {
    quitar: plan.quitar.map((l) => ({
      producto: dominio.textoProductoAjuste({ codigo: l.CodigoBarra, cantidad: l.Cantidad, tipo: l.Tipo, referencia: l.Referencia, color: l.Color, talla: l.Talla }),
      descripcion: l.DescripcionExcel || null,
    })),
    agregar: plan.agregar.map((l) => ({ producto: dominio.textoProductoAjuste(l), descripcion: l.descripcion || null, decision: l.decStatus })),
    iguales: plan.iguales,
    estadoActual: r.Status,
    estadoNuevo: estado.status,
    estado,
  };
}

/** Los faltantes del reclamo ya ajustado deben estar en los 911 (PDF) que tiene adjuntos. */
async function exigirFaltantesEnPdfs(r, actuales, plan) {
  const faltantes = [
    ...actuales.filter((l) => !plan.quitar.includes(l)).map((l) => ({ posicion: l.Posicion, codigoBarra: l.CodigoBarra, descripcion: l.DescripcionExcel, cantidad: l.Cantidad, tipo: l.Tipo })),
    ...plan.agregar.map((l, i) => ({ posicion: `nuevo ${i + 1}`, codigoBarra: l.codigoBarra, descripcion: l.descripcion, cantidad: l.cantidad, tipo: l.tipo })),
  ];
  if (!plan.agregar.some((l) => l.tipo === 'faltante_real')) return;
  const filas = [];
  let legibles = true;
  for (const a of parseJsonArray(r.AdjuntosExtra).filter((x) => x.tipo === 'pdf')) {
    const nota = await leerNotaPdf(reclamoArchivoPath(a.filename));
    if (nota.legible) filas.push(...nota.filas);
    else legibles = false;
  }
  await exigirFaltantesEn911(faltantes, { filas, legibles });
}

export async function reemplazarExcel(token, multerFile, usuario, { ajustar = false } = {}) {
  if (!multerFile) throw badRequest('Selecciona el Excel del reclamo.');
  const creados = [multerFile.filename];
  try {
    exigirAdmin(usuario);
    const r = await obtenerOFallar(token);
    exigir(dominio.motivoNoCambiarExcel(r));
    const { tipo, parsed, actuales, delExcel, iguales } = await validarExcelNuevo(r, multerFile);

    // Productos distintos: sin confirmar, se dice qué cambiaría; confirmado, se valida contra el 911.
    let plan = null;
    if (!iguales) {
      plan = dominio.planAjusteExcel(actuales, delExcel, esAutoAprobado);
      const ajuste = resumenAjuste(r, actuales, plan);
      if (!ajustar) {
        throw conflict(
          `El Excel nuevo no trae los mismos productos que el reclamo: agrega ${ajuste.agregar.length}, quita ${ajuste.quitar.length} y ${ajuste.iguales} quedan igual. Revisa los cambios y confirma para ajustar el reclamo a este Excel.`,
          { code: 'EXCEL_PRODUCTOS_DISTINTOS', ajuste: { ...ajuste, estado: undefined } }
        );
      }
      if (!delExcel.length) throw badRequest('El Excel no trae productos: el reclamo debe tener al menos uno.');
      await exigirFaltantesEnPdfs(r, actuales, plan);
    }

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
    const excel = { archivo: multerFile.filename, nombre, imagenes };
    const res = plan
      ? await repo.ajustarAlExcel(token, excel, {
          verificar: (fila) => dominio.motivoNoCambiarExcel(fila),
          // Se vuelve a planear con las filas bloqueadas: si alguien cambió algo mientras tanto, cuenta.
          plan: (fila, filas) => {
            const p = dominio.planAjusteExcel(filas, delExcel, esAutoAprobado);
            const quedan = filas.filter((l) => !p.quitar.includes(l));
            const lineas = [...quedan.map((l) => ({ tipo: l.Tipo, decStatus: l.DecStatus })), ...p.agregar.map((l) => ({ tipo: l.tipo, decStatus: l.decStatus }))];
            return {
              quitar: p.quitar.map((l) => Number(l.LineaId)),
              agregar: p.agregar.map((l) =>
                l.decStatus === 'aprobado' ? { ...l, decComentario: COMENTARIO_AUTO_APROBADO, decBy: USUARIO_SISTEMA } : { ...l, decComentario: null, decBy: null }
              ),
              estado: dominio.estadoTrasAjuste(fila, lineas, TIPOS_SOLO_NOTIFICACION),
            };
          },
        })
      : await repo.cambiarExcelPrincipal(token, excel, (fila) => dominio.motivoNoCambiarExcel(fila));
    if (!res) throw notFound('Reclamo no encontrado.');
    exigir(res.bloqueado);
    creados.length = 0; // ya quedaron registrados en la BD

    // Solo después del commit: el Excel anterior y sus fotos ya no se usan.
    await borrarArchivos([res.anterior.archivo, ...res.anterior.imagenes.map((i) => i.filename)].filter(Boolean));
    const dto = await detalle(token);
    logger.info(
      {
        reclamo: dto.Numero,
        antes: res.anterior.nombre,
        ahora: nombre,
        productos: parsed.lineas.length,
        ...(plan ? { quitados: res.quitados, agregados: res.agregados, estado: `${res.desde} → ${res.hacia}` } : {}),
        usuario: nombreUsuario(usuario),
      },
      plan ? 'Reclamo ajustado al Excel nuevo' : 'Excel del reclamo reemplazado'
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
