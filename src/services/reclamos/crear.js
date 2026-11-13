// Crear un reclamo: vista previa del Excel y de los PDF de SAP, validaciones
// y alta con sus productos, adjuntos y fotos embebidas.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectarTipo } from '../../utils/tipoArchivo.js';
import * as repo from '../../repositories/reclamosRepository.js';
import * as catalogos from './catalogos.js';
import * as tiendasRepo from '../../repositories/tiendasRepository.js';
import {
  parsearPlantilla,
  leerLibro,
  FormatoNoReconocidoError,
  PlantillaIncompletaError,
  FechaInvalidaError,
  detectarTipoPorMotivo,
  cantidadCedi,
  motivoFaltantesSinDocumento,
  motivoHojasNoReconocidas,
} from './excelParser.js';
import { extraerImagenesExcel, borrarArchivos } from './excelImages.js';
import { TIPOS_SOLO_NOTIFICACION, COMENTARIO_AUTO_APROBADO, USUARIO_SISTEMA, esAutoAprobado, resolverTipoLinea } from './tipos.js';
import { consultarProductos, proveedorPorCodigoBarra, materialesDeCodigos } from '../sapProductosService.js';
import { faltantesContra911 } from '../contabilidad/validarDocumento.js';
import { leerNotaPdf } from '../contabilidad/leerNotaPdf.js';
import { crearReclamoSchema } from '../../validators/reclamos.schema.js';
import { badRequest } from '../../utils/httpError.js';
import { tienePermiso } from '../acceso/permisos.js';
import { exigirDivision } from '../divisiones.js';
import { avisarReclamo } from '../correo/avisosReclamos.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { normalizarDocSap, motivoDocsRepetidos, motivoDocsEnOtrosReclamos, documentosUsados, motivoFechaLlegadaInvalida, esDevolucion, estadoAlCrear, motivoFaltantesNoEn911 } from '../../domain/reclamo.js';
import { diaPanama } from '../../domain/tablero.js';
import { tipoReal, tipoRealDeArchivo, nombreUsuario, detalle, exigir, conDocumentos, sucursalOficial } from './comun.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { tiendaDe } from '../acceso/alcanceTienda.js';
import { motivoTiendaReclamo, tiendaDeSucursal } from '../../domain/tienda.js';
import { copiarPdf, TIPO_RECLAMO } from '../evidenceStorage/copiasPdf.js';

export const ORIGEN_PRINCIPAL = 'principal';
/** Filas que se mandan al formulario en la vista previa (= máx. de líneas editables). */
export const MAX_FILAS_FORM = 2000;

const SAP_DOC_OPCIONAL = env.reclamos.sapDocOpcional && env.nodeEnv !== 'production';
if (env.reclamos.sapDocOpcional && env.nodeEnv === 'production') {
  logger.warn('RECLAMOS_SAP_DOC_OPCIONAL=true se ignora en producción: el documento SAP sigue siendo obligatorio.');
}

// ------------------------------------------------------------------
// Vista previa del Excel (no guarda nada)
// ------------------------------------------------------------------

async function autocompletarProveedor(parsed) {
  let proveedor = parsed.proveedor;
  if (!proveedor) {
    // CEDI no trae proveedor: primer código de barra válido -> última OC en SAP.
    for (const l of parsed.lineas.filter((x) => x.codigoBarra).slice(0, 20)) {
      proveedor = await proveedorPorCodigoBarra(l.codigoBarra);
      if (proveedor) break;
    }
  }
  // ProveedorRelaciones (local) manda sobre el catálogo de FelixApproval; de
  // este último solo se toma un valor si el proveedor tiene uno solo.
  const [rel, cat] = proveedor
    ? await Promise.all([repo.buscarRelacionProveedor(proveedor), catalogos.relacionProveedor(proveedor)])
    : [null, null];
  return {
    proveedor: cat?.proveedor || proveedor || null,
    compradora: catalogos.unico(cat?.compradoras),
    mundo: parsed.mundo || rel?.Mundo || catalogos.unico(cat?.mundos) || null,
    departamento: parsed.departamento || rel?.Departamento || catalogos.unico(cat?.departamentos) || null,
    marca: parsed.marca || rel?.Marca || catalogos.unico(cat?.marcas) || null,
  };
}

/**
 * La plantilla Tienda trae el código ("TD28") o el nombre escrito a mano
 * ("COSTA DEL ESTE"); el formulario usa el nombre del catálogo ("Costa del
 * Este"). Si no está en el catálogo se deja tal cual (el formulario pide elegirla).
 */
async function nombreSucursal(valor) {
  if (!valor) return null;
  try {
    return tiendaDeSucursal(valor, await tiendasRepo.listarTiendasActivas())?.Nombre ?? valor;
  } catch {
    return valor;
  }
}

export async function previsualizarExcel(multerFile) {
  if (!multerFile) throw badRequest('Adjunta el Excel del reclamo.');
  const tipo = tipoReal(await detectarTipo(multerFile.buffer));
  if (tipo !== 'xlsx' && tipo !== 'xls') throw badRequest('El archivo no es un Excel válido.');

  let parsed;
  try {
    parsed = parsearPlantilla(multerFile.buffer);
  } catch (err) {
    if (err instanceof FormatoNoReconocidoError) throw badRequest(err.message, { code: 'FORMATO_NO_RECONOCIDO' });
    if (err instanceof PlantillaIncompletaError) throw badRequest(err.message, { code: err.code, faltas: err.faltas });
    if (err instanceof FechaInvalidaError) throw badRequest(err.message, { code: 'FECHA_INVALIDA' });
    throw badRequest('No se pudo leer el Excel. Verifica que no esté dañado ni protegido con contraseña.');
  }

  const codigos = [...new Set(parsed.lineas.map((l) => l.codigoBarra).filter(Boolean))];
  const [auto, sap, sucursal] = await Promise.all([
    autocompletarProveedor(parsed),
    consultarProductos(codigos),
    nombreSucursal(parsed.sucursal),
  ]);

  return {
    origen: parsed.formato,
    hoja: parsed.hoja,
    sucursal,
    division: parsed.division || null,
    documentosSap: parsed.documentosSap || [],
    comentario: parsed.comentario || null,
    // La FECHA del Excel es la de llegada de la mercancía; la de registro es hoy.
    fechaLlegadaMercancia: parsed.fechaRegistro,
    numeroEmbarqueFactura: parsed.numeroEmbarqueFactura,
    ...auto,
    tipoSugerido: parsed.tipoSugerido,
    desglose: parsed.desglose,
    lineasTotal: parsed.lineas.length,
    lineasSinMotivo: parsed.lineasSinMotivo,
    // Plantilla CEDI por hojas: faltantes sin DOCUMENTO (no deja crear el reclamo).
    faltantesSinDocumento: motivoFaltantesSinDocumento(parsed.faltantesSinDocumento)?.mensaje || null,
    // Hojas de la plantilla CEDI con datos pero sin sus títulos: no deja crear (se perderían sus productos).
    hojasNoReconocidas: motivoHojasNoReconocidas(parsed.hojasIgnoradas)?.mensaje || null,
    // Hoja «Averia»: filas sin foto en el Excel. El formulario pide subir sus fotos en el paso 4.
    averiasSinFoto: (parsed.averiasSinFoto || []).map(({ fila, codigoBarra }) => ({ fila, codigoBarra })),
    // Sobrante no esperado: los que no están en SAP (o sin código) se avisan a Data.
    sobranteNoEsperado: resumenSobranteNoEsperado(parsed.lineas, sap),
    // Las filas con las columnas de la plantilla: son el formulario de productos.
    filas: parsed.lineas.slice(0, MAX_FILAS_FORM).map((l) => ({
      posicion: l.posicion,
      ...l.cedi,
      codigoBarra: l.codigoBarra || null,
      descripcion: l.descripcion,
      motivo: l.motivoTexto || null,
    })),
    validacionCodigos: {
      disponible: sap.disponible,
      encontrados: sap.disponible ? codigos.filter((c) => sap.productos.has(c)).length : null,
      noEncontrados: sap.disponible ? codigos.filter((c) => !sap.productos.has(c)) : [],
    },
  };
}

/**
 * Un sobrante no esperado necesita a Data si no trae código o su código no
 * está en SAP: la compradora lo decide igual y, si lo aprueba, al cerrar el
 * reclamo se avisa a Data. Con SAP caído no se puede saber: los que traen
 * código cuentan como creados y queda en el log.
 */
const esperaData = (l, sap) => l.tipo === 'sobrante_no_esperado' && (!l.codigoBarra || (sap.disponible && !sap.productos.has(l.codigoBarra)));

function resumenSobranteNoEsperado(lineas, sap) {
  const sne = lineas.filter((l) => l.tipo === 'sobrante_no_esperado');
  if (!sne.length) return null;
  return { total: sne.length, paraData: sne.filter((l) => esperaData(l, sap)).length, sapDisponible: sap.disponible };
}

/** Marca `esperaData` en los sobrantes no esperados (consulta SAP una sola vez). */
async function marcarEsperaData(lineas) {
  const sne = lineas.filter((l) => l.tipo === 'sobrante_no_esperado');
  if (!sne.length) return lineas;
  const sap = await consultarProductos(sne.map((l) => l.codigoBarra).filter(Boolean));
  if (!sap.disponible && sne.some((l) => l.codigoBarra)) {
    logger.warn('SAP no disponible al crear: los sobrantes no esperados con código van a la compradora sin validar en SAP');
  }
  return lineas.map((l) => (l.tipo === 'sobrante_no_esperado' ? { ...l, esperaData: esperaData(l, sap) } : l));
}

// ------------------------------------------------------------------
// PDF de los documentos SAP
// ------------------------------------------------------------------

export { normalizarDocSap };

/** Para el aviso en vivo del formulario: en qué reclamos ya está cada documento. */
export async function documentosSapUsados(docs) {
  const lista = docs.map((d) => String(d).trim()).filter(Boolean).slice(0, 50);
  return { usados: documentosUsados(lista, conDocumentos(await repo.buscarPorDocumentosSap(lista.map(normalizarDocSap)))) };
}

/** Número de documento impreso en el PDF ("Doc Num: …"), o null si no se encuentra. */
async function numeroDocumentoPdf(origen) {
  const nota = await leerNotaPdf(origen);
  return nota.numeroDocumento ? String(nota.numeroDocumento).trim() : null;
}

/** Vista previa en el formulario: qué número de documento SAP trae el PDF. */
export async function previsualizarPdfSap(multerFile) {
  if (!multerFile) throw badRequest('Adjunta el PDF del documento SAP.');
  const tipo = tipoReal(await detectarTipo(multerFile.buffer));
  if (tipo !== 'pdf') throw badRequest('El archivo no es un PDF válido.');
  return { numeroDocumento: await numeroDocumentoPdf(multerFile.buffer) };
}

/**
 * Cada documento SAP del reclamo debe venir con su PDF, y cada PDF debe traer
 * impreso el número de uno de esos documentos. Devuelve los adjuntos a guardar
 * y los productos de los PDF (`filas`; `legibles` false si alguno no se leyó).
 */
async function validarPdfsSap(docs, pdfs, usuario) {
  const esperados = new Map(docs.map((d) => [normalizarDocSap(d), d]));
  const cubiertos = new Set();
  const adjuntos = [];
  const filas = [];
  let legibles = true;
  for (const f of pdfs) {
    const nombre = path.basename(f.originalname || f.filename).slice(0, 255);
    if ((await tipoRealDeArchivo(f)) !== 'pdf') throw badRequest(`«${nombre}» no es un PDF válido.`);
    const nota = await leerNotaPdf(f.path);
    const numero = nota.numeroDocumento ? String(nota.numeroDocumento).trim() : null;
    if (nota.legible) filas.push(...nota.filas);
    else legibles = false;
    if (!numero) throw badRequest(`No se encontró el número de documento SAP en «${nombre}». Sube el PDF del documento de SAP.`);
    const clave = normalizarDocSap(numero);
    if (!esperados.has(clave)) {
      throw badRequest(`El PDF «${nombre}» es del documento ${numero}, que no está en los documentos SAP del reclamo.`);
    }
    if (cubiertos.has(clave)) throw badRequest(`El documento SAP ${numero} tiene más de un PDF. Sube uno solo por documento.`);
    cubiertos.add(clave);
    adjuntos.push({
      filename: f.filename,
      originalname: nombre,
      tipo: 'pdf',
      documentoSap: esperados.get(clave),
      uploaded_at: new Date().toISOString(),
      uploaded_by: nombreUsuario(usuario),
    });
  }
  const faltan = [...esperados].filter(([k]) => !cubiertos.has(k)).map(([, d]) => d);
  if (faltan.length) {
    throw badRequest(
      faltan.length === 1 ? `Falta el PDF del documento SAP ${faltan[0]}.` : `Faltan los PDF de los documentos SAP: ${faltan.join(', ')}.`,
      { code: 'FALTAN_PDF_SAP', faltan }
    );
  }
  return { adjuntos, filas, legibles };
}

/**
 * Los faltantes deben estar en los 911 subidos (mismo producto y cantidad).
 * Si algún PDF no se pudo leer, no se valida (no se frena el reclamo por eso).
 * El material SAP solo se busca para los que no aparecen por descripción.
 */
async function exigirFaltantesEn911(lineas, pdfsSap) {
  const faltantes = lineas.filter((l) => l.tipo === 'faltante_real');
  if (!faltantes.length || !pdfsSap.filas.length || !pdfsSap.legibles) return;
  let res = faltantesContra911(faltantes, pdfsSap.filas);
  if (res.noEstan.length || res.sinVerificar.length || res.cantidadDistinta.length) {
    const sap = await materialesDeCodigos(faltantes.map((l) => l.codigoBarra));
    res = faltantesContra911(faltantes, pdfsSap.filas, sap.materiales);
  }
  const motivo = motivoFaltantesNoEn911(res);
  if (motivo) {
    const { mensaje, ...extra } = motivo;
    throw badRequest(mensaje, extra);
  }
}

// ------------------------------------------------------------------
// Compradoras (catálogo de FelixApproval)
// ------------------------------------------------------------------

export const catalogosFormulario = () => catalogos.catalogosFormulario();
export const relacionProveedor = (nombre) => catalogos.relacionProveedor(nombre);

/** La compradora debe ser una del catálogo; si el catálogo no responde, no bloquea la creación. */
async function validarCompradora(compradora) {
  const lista = await catalogos.compradorasValidas();
  if (!lista) {
    logger.warn('Catálogo de compradoras no disponible: se acepta la compradora sin validar');
    return compradora;
  }
  const valida = lista.find((c) => c.toUpperCase() === compradora.trim().toUpperCase());
  if (!valida) throw badRequest('Selecciona una compradora de la lista.');
  return valida;
}

// ------------------------------------------------------------------
// Crear
// ------------------------------------------------------------------

function validarCampos(body) {
  const result = crearReclamoSchema.safeParse(body);
  if (!result.success) {
    const primero = result.error.issues[0]?.message || 'Datos inválidos.';
    throw badRequest(primero, { detalles: result.error.flatten() });
  }
  const data = result.data;

  const hoy = diaPanama(new Date());
  const fechaLlegada = motivoFechaLlegadaInvalida(data.fechaLlegadaMercancia, hoy);
  if (fechaLlegada) throw badRequest(fechaLlegada.mensaje, { code: fechaLlegada.code });

  // Al menos 1 documento SAP entre los 3 fijos + los extra. Se compactan en
  // orden: los 3 primeros llenos van a SapDoc1..3, el resto a SapDocsExtra.
  const docs = [data.sapDoc1, data.sapDoc2, data.sapDoc3, ...data.sapDocsExtra].filter(Boolean);
  if (!docs.length && !SAP_DOC_OPCIONAL) throw badRequest('Ingresa al menos un documento SAP.');
  // La fecha de registro es siempre el día en que se crea el reclamo (la del Excel es la de llegada).
  return { ...data, fechaRegistro: hoy, sapDoc1: docs[0], sapDoc2: docs[1], sapDoc3: docs[2], sapDocsExtra: docs.slice(3) };
}

/**
 * Productos tal como quedaron en el formulario (columnas de la plantilla) ->
 * mismo formato que las líneas del parser.
 */
function lineasDelFormulario(filas) {
  return filas.map((f, i) => {
    const tipo = detectarTipoPorMotivo(f.motivo);
    return {
      posicion: i + 1,
      codigoBarra: f.codigoBarra,
      cantidad: cantidadCedi({ tipo, ...f }),
      descripcion: f.descripcion || null,
      tipo,
    };
  });
}

/** Líneas (del formulario o del Excel) -> filas de ReclamoLineas, con su tipo y auto-aprobado. */
function construirLineas(parsed, tipoReclamo) {
  return parsed.lineas.map((l) => {
    const tipo = resolverTipoLinea(l.tipo, tipoReclamo);
    const auto = esAutoAprobado(tipo);
    return {
      posicion: l.posicion,
      codigoBarra: l.codigoBarra || null,
      cantidad: l.cantidad,
      descripcion: l.descripcion,
      referencia: l.referencia || null,
      color: l.color || null,
      talla: l.talla || null,
      tipo,
      decStatus: auto ? 'aprobado' : 'pendiente',
      decComentario: auto ? COMENTARIO_AUTO_APROBADO : null,
      decBy: auto ? USUARIO_SISTEMA : null,
    };
  });
}

export async function crear(body, multerFile, usuario, pdfs = []) {
  const archivosCreados = [...(multerFile ? [multerFile.filename] : []), ...pdfs.map((f) => f.filename)];
  try {
    const data = validarCampos(body);
    if (data.origen === 'cedi' && tienePermiso(usuario, 'reclamos.solo_tienda')) {
      throw badRequest('Tu rol solo crea reclamos de Tienda, no de CEDI.', { code: 'SOLO_TIENDA' });
    }
    if (data.origen === 'tienda' && tienePermiso(usuario, 'reclamos.solo_cedi')) {
      throw badRequest('Tu rol solo crea reclamos de CEDI, no de Tienda.', { code: 'SOLO_CEDI' });
    }
    // Sucursal con el nombre del catálogo (o 400 si no es una tienda).
    if (data.origen === 'tienda') data.sucursal = await sucursalOficial(data.sucursal);
    // Usuario en una tienda (Configuración → Tiendas): solo reclamos de su tienda.
    const ajena = motivoTiendaReclamo(await tiendaDe(usuario), data);
    if (ajena) throw badRequest(ajena, { code: 'TIENDA_AJENA' });
    // Un documento SAP pertenece a un solo reclamo: se revisa antes de leer
    // archivos (aviso rápido) y otra vez dentro de la transacción del alta.
    const docsSap = [data.sapDoc1, data.sapDoc2, data.sapDoc3, ...data.sapDocsExtra].filter(Boolean);
    const repetidos = motivoDocsRepetidos(docsSap);
    if (repetidos) throw badRequest(repetidos.mensaje, { code: repetidos.code });
    const enOtros = (filas) => motivoDocsEnOtrosReclamos(docsSap, conDocumentos(filas));
    exigir(enOtros(await repo.buscarPorDocumentosSap(docsSap.map(normalizarDocSap))));
    // El Excel del reclamo es obligatorio siempre (Tienda y CEDI).
    if (!multerFile) throw badRequest('El Excel del reclamo es obligatorio.');
    data.compradora = await validarCompradora(data.compradora);

    let tipo = null;
    let buffer = null;
    if (multerFile) {
      tipo = await tipoRealDeArchivo(multerFile);
      if (tipo !== 'xlsx' && tipo !== 'xls') throw badRequest('El archivo del reclamo no es un Excel válido.');
      buffer = await fs.readFile(multerFile.path);
      try {
        leerLibro(buffer);
      } catch {
        throw badRequest('No se pudo leer el Excel. Verifica que no esté dañado ni protegido con contraseña.');
      }
    }

    // Los productos del formulario (llenado desde el Excel o a mano) mandan.
    // Sin ellos, best-effort desde el Excel: si el detalle no se puede
    // extraer, el reclamo igual se crea.
    let lineas = [];
    if (data.lineas) {
      lineas = construirLineas({ lineas: lineasDelFormulario(data.lineas) }, data.tipo);
    } else {
      let parsed = null;
      try {
        parsed = parsearPlantilla(buffer);
      } catch (err) {
        // Una fecha inválida es un error de validación del Excel, no "sin detalle".
        if (err instanceof FechaInvalidaError) throw badRequest(err.message, { code: 'FECHA_INVALIDA' });
        // Falta algo de la plantilla: se dice qué, en vez de crear el reclamo sin productos.
        if (err instanceof PlantillaIncompletaError) throw badRequest(err.message, { code: err.code, faltas: err.faltas });
        logger.warn({ err: err.message }, 'Reclamo creado sin líneas: no se pudo extraer el detalle del Excel');
      }
      if (parsed) {
        // Plantilla CEDI por hojas: cada faltante debe traer su documento.
        const sinDocumento = motivoFaltantesSinDocumento(parsed.faltantesSinDocumento);
        if (sinDocumento) throw badRequest(sinDocumento.mensaje, { code: sinDocumento.code });
        const hojaMal = motivoHojasNoReconocidas(parsed.hojasIgnoradas);
        if (hojaMal) throw badRequest(hojaMal.mensaje, { code: hojaMal.code });
        lineas = construirLineas(parsed, data.tipo);
      }
    }
    lineas = await marcarEsperaData(lineas);

    // División: ya no se pide en el formulario (2026-11-12). Si llega una, solo
    // las del catálogo (Perfumería o Cosméticos), como están escritas allí.
    if (data.origen !== 'cedi') data.division = '';
    if (data.division) data.division = await exigirDivision(data.division);

    // Un PDF por cada documento SAP, con el mismo número impreso.
    const pdfsSap = await validarPdfsSap(docsSap, pdfs, usuario);
    const adjuntosSap = pdfsSap.adjuntos;
    // Los faltantes del Excel deben estar en el 911.
    await exigirFaltantesEn911(lineas, pdfsSap);

    // Motivo: si es un valor nuevo queda guardado en su catálogo. Va al final,
    // después de validar el Excel y los PDF, para no registrar valores de un
    // reclamo que no pasa las validaciones. Ojo: corre FUERA de la transacción
    // del alta, así que si repo.crear falla después (p. ej. documento SAP ya
    // usado en otro reclamo), el motivo nuevo queda igual en el catálogo.
    if (data.motivo) data.motivo = await repo.asegurarValorCatalogo('motivo', data.motivo, nombreUsuario(usuario));

    const token = crypto.randomUUID();
    const status = estadoAlCrear({ soloNotificacion: TIPOS_SOLO_NOTIFICACION.has(data.tipo), lineas });
    const alta = await repo.crear(
      {
        ...data,
        adjuntosExtra: adjuntosSap,
        token,
        status,
        // Cierre automático (todos los productos se aprobaron solos): lo «decide» el sistema.
        decisionBy: status === 'resuelto' ? USUARIO_SISTEMA : null,
        // Las devoluciones (del tipo o con algún producto de ese motivo) siempre las retira el proveedor.
        retiroProveedor: data.retiroProveedor === 'si' || esDevolucion({ Tipo: data.tipo, LineasDevolucion: lineas.filter((l) => l.tipo === 'devolucion').length }),
        archivoExcel: multerFile ? multerFile.filename : null,
        archivoExcelNombre: multerFile ? path.basename(multerFile.originalname || '').slice(0, 255) : null,
        createdBy: nombreUsuario(usuario),
      },
      lineas,
      { docsSap: docsSap.map(normalizarDocSap), motivoBloqueo: enOtros }
    );
    exigir(alta.bloqueado);
    archivosCreados.length = 0; // el Excel y los PDF ya quedaron registrados en la BD

    // Best-effort: fotos embebidas del Excel principal.
    if (tipo === 'xlsx') {
      let imagenes = [];
      try {
        imagenes = await extraerImagenesExcel(multerFile.path, ORIGEN_PRINCIPAL);
        if (imagenes.length) {
          const res = await repo.modificarArchivos(token, (a) => ({ ...a, imagenes: [...a.imagenes, ...imagenes] }));
          if (!res) await borrarArchivos(imagenes.map((i) => i.filename));
        }
      } catch (err) {
        // Si falló el registro en la BD, las fotos ya extraídas quedarían huérfanas.
        await borrarArchivos(imagenes.map((i) => i.filename));
        logger.warn({ err: err.message }, 'No se pudieron extraer las fotos del Excel del reclamo');
      }
    }

    const dto = await detalle(token);
    for (const a of adjuntosSap) {
      copiarPdf(reclamoArchivoPath(a.filename), { filename: a.filename, titulo: `${dto.Numero} — ${a.originalname}`, tipoDocumento: TIPO_RECLAMO });
    }
    // Aviso a las compradoras: solo si espera su decisión (los «notificados» son solo informativos).
    // Los sobrantes no esperados que no están en SAP los decide ella primero; a Data se le avisa al cerrar.
    if (dto.Status === 'pendiente') avisarReclamo('nuevo', dto, { comentario: dto.Comentario, de: usuario.name || nombreUsuario(usuario) });
    // Cerrado solo: al supervisor GOF, que ya lo tiene para enviar a contabilidad.
    if (dto.Status === 'resuelto') avisarReclamo('cerrado', dto);
    return dto;
  } catch (err) {
    await borrarArchivos(archivosCreados);
    throw err;
  }
}
