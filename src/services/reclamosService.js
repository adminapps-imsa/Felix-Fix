import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectarTipo, detectarTipoArchivo } from '../utils/tipoArchivo.js';
import * as repo from '../repositories/reclamosRepository.js';
import { parseJsonArray } from '../repositories/reclamosRepository.js';
import * as catalogos from './reclamos/catalogos.js';
import * as tiendasRepo from '../repositories/tiendasRepository.js';
import {
  parsearPlantilla,
  leerLibro,
  FormatoNoReconocidoError,
  FechaInvalidaError,
  detectarTipoPorMotivo,
  cantidadCedi,
} from './reclamos/excelParser.js';
import { extraerImagenesExcel, borrarArchivos, CONTENT_TYPE_IMAGEN } from './reclamos/excelImages.js';
import {
  TIPOS_SOLO_NOTIFICACION,
  COMENTARIO_AUTO_APROBADO,
  USUARIO_SISTEMA,
  TIPOS_AUTO_APROBADOS,
  esAutoAprobado,
  resolverTipoLinea,
} from './reclamos/tipos.js';
import { consultarProductos, proveedorPorCodigoBarra } from './sapProductosService.js';
import { reclamoArchivoPath } from '../config/almacenamiento.js';
import { tienePermiso } from './acceso/permisos.js';
import * as dominio from '../domain/reclamo.js';
import { nombresDeUsuarios, datosDeUsuario } from './acceso/keycloakAdmin.js';
import { enviarCorreo } from './correo/mailer.js';
import { destinatarios } from './correo/avisosProductosDanados.js';
import { plantillaReclamoContabilidad } from './correo/plantillaReclamoContabilidad.js';
import { calcularDocumentos, sincronizarDocumentos } from './contabilidad/sincronizar.js';
import { leerNotaPdf } from './contabilidad/leerNotaPdf.js';
import { cruzar } from './contabilidad/validarDocumento.js';
import { crearReclamoSchema } from '../validators/reclamos.schema.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const ORIGEN_PRINCIPAL = 'principal';
/** Filas que se mandan al formulario en la vista previa (= máx. de líneas editables). */
export const MAX_FILAS_FORM = 2000;
const RE_UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

function validarToken(token) {
  if (!RE_UUID.test(String(token || ''))) throw notFound('Reclamo no encontrado.');
  return token;
}

function validarIndice(idx) {
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0) throw notFound('Archivo no encontrado.');
  return n;
}

async function obtenerOFallar(token) {
  const reclamo = await repo.obtenerPorToken(validarToken(token));
  if (!reclamo) throw notFound('Reclamo no encontrado.');
  return reclamo;
}

/** Magic bytes: el MIME del navegador no es confiable. xlsx = 'xlsx', xls = 'cfb'. */
function tipoReal(detected) {
  if (!detected) return null;
  if (detected.ext === 'xlsx') return 'xlsx';
  if (detected.ext === 'cfb') return 'xls';
  if (detected.ext === 'pdf') return 'pdf';
  return null;
}

async function tipoRealDeArchivo(multerFile) {
  return tipoReal(await detectarTipoArchivo(multerFile.path));
}

const SAP_DOC_OPCIONAL = env.reclamos.sapDocOpcional && env.nodeEnv !== 'production';
if (env.reclamos.sapDocOpcional && env.nodeEnv === 'production') {
  logger.warn('RECLAMOS_SAP_DOC_OPCIONAL=true se ignora en producción: el documento SAP sigue siendo obligatorio.');
}

const estadoNotaAprobada = (r) => dominio.estadoNotaAprobada(r, parseJsonArray(r.AdjuntosExtra));

/** Traduce el motivo de una regla del dominio (o null) a 409. */
function exigir(motivo) {
  if (motivo) throw conflict(motivo.mensaje, motivo.code && { code: motivo.code });
}

function todosLosDocsSap(r) {
  return [r.SapDoc1, r.SapDoc2, r.SapDoc3, ...parseJsonArray(r.SapDocsExtra)].filter((d) => d && String(d).trim());
}

export function numeroReclamo(id) {
  return `REC-${String(id).padStart(6, '0')}`;
}

function aDto(r) {
  const { ArchivoExcel, ...resto } = r;
  return {
    ...resto,
    Numero: numeroReclamo(r.ReclamoId),
    SapDocsExtra: parseJsonArray(r.SapDocsExtra),
    SapDocs: todosLosDocsSap(r),
    ImagenesExcel: parseJsonArray(r.ImagenesExcel),
    AdjuntosExtra: parseJsonArray(r.AdjuntosExtra),
    TieneExcel: Boolean(ArchivoExcel),
    ...estadoNotaAprobada(r),
  };
}

/** Agrega el nombre completo (de Keycloak) junto a cada username guardado. */
async function conNombres(dtos) {
  const nombres = await nombresDeUsuarios(
    dtos.flatMap((d) => [d.CreatedBy, d.DecisionBy, d.EnviadoContabilidadBy, ...d.AdjuntosExtra.map((a) => a.uploaded_by)])
  );
  const n = (u) => (u ? nombres.get(u) || u : null);
  return dtos.map((d) => ({
    ...d,
    CreatedByNombre: n(d.CreatedBy),
    DecisionByNombre: n(d.DecisionBy),
    EnviadoContabilidadByNombre: n(d.EnviadoContabilidadBy),
    AdjuntosExtra: d.AdjuntosExtra.map((a) => ({ ...a, uploaded_by_nombre: n(a.uploaded_by) })),
  }));
}

async function lineasConNombres(lineas) {
  const nombres = await nombresDeUsuarios(lineas.map((l) => l.DecBy));
  return lineas.map((l) => ({ ...l, DecByNombre: l.DecBy ? nombres.get(l.DecBy) || l.DecBy : null }));
}

function nombreUsuario(usuario) {
  return usuario.username || usuario.sub;
}

/** Regla del dominio: ya enviado a contabilidad o cerrado → 409 con el motivo. */
const asegurarModificable = (estado, accion, opciones) => exigir(dominio.motivoNoModificable(estado, accion, opciones));

// ------------------------------------------------------------------
// Consultas
// ------------------------------------------------------------------

export function permisos(usuario) {
  const puedeDecidir = tienePermiso(usuario, 'reclamos.decidir');
  return {
    puedeCrear: tienePermiso(usuario, 'reclamos.crear'),
    puedeDecidir,
    puedeEliminar: tienePermiso(usuario, 'reclamos.eliminar'),
    // Adjuntar en cualquier reclamo (no solo en los propios).
    puedeAdjuntar: puedeDecidir || tienePermiso(usuario, 'reclamos.adjuntar'),
    // Torre de Control: también agrega adjuntos cuando el reclamo ya tiene decisión.
    puedeAdjuntarCerrado: tienePermiso(usuario, 'reclamos.adjuntar'),
    // Enviar a contabilidad: solo quien tiene el permiso propio (Gof, Torre de Control). La compradora decide, no envía.
    puedeEnviarContabilidad: tienePermiso(usuario, 'reclamos.enviar_contabilidad'),
    esAdmin: puedeDecidir,
    username: nombreUsuario(usuario),
  };
}

export async function listar(query) {
  const pagination = parsePagination(query);
  const filtros = { status: query.status || undefined, porEnviar: query.porEnviar === '1', q: query.q?.trim() || undefined };
  const [{ items, total }, kpis] = await Promise.all([repo.listar(filtros, pagination), repo.obtenerKpis()]);
  return { data: await conNombres(items.map(aDto)), pagination: buildPaginationMeta({ ...pagination, total }), kpis };
}

export async function detalle(token) {
  const [dto] = await conNombres([aDto(await obtenerOFallar(token))]);
  return dto;
}

export async function archivoExcel(token) {
  const r = await obtenerOFallar(token);
  if (!r.ArchivoExcel) throw notFound('Este reclamo no tiene Excel.');
  return {
    ruta: reclamoArchivoPath(r.ArchivoExcel),
    nombre: r.ArchivoExcelNombre || `${numeroReclamo(r.ReclamoId)}${path.extname(r.ArchivoExcel)}`,
  };
}

export async function imagen(token, idx) {
  const r = await obtenerOFallar(token);
  const img = parseJsonArray(r.ImagenesExcel)[validarIndice(idx)];
  if (!img) throw notFound('Imagen no encontrada.');
  const ext = path.extname(img.filename).slice(1).toLowerCase();
  return { ruta: reclamoArchivoPath(img.filename), contentType: CONTENT_TYPE_IMAGEN[ext] || 'application/octet-stream' };
}

export async function adjunto(token, idx) {
  const r = await obtenerOFallar(token);
  const adj = parseJsonArray(r.AdjuntosExtra)[validarIndice(idx)];
  if (!adj) throw notFound('Adjunto no encontrado.');
  const ext = path.extname(adj.filename).toLowerCase();
  const contentType =
    adj.tipo === 'pdf'
      ? 'application/pdf'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return { ruta: reclamoArchivoPath(adj.filename), nombre: adj.originalname || adj.filename, contentType };
}

// ------------------------------------------------------------------
// Vista previa del Excel (no guarda nada)
// ------------------------------------------------------------------

async function autocompletarProveedor(parsed) {
  let proveedor = parsed.proveedor;
  if (!proveedor) {
    // CEDI no trae proveedor: primer código de barra válido -> última OC en SAP.
    for (const l of parsed.lineas.slice(0, 20)) {
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
 * La plantilla Tienda trae el código ("TD28"); el formulario usa el nombre del
 * catálogo de tiendas ("Town Center"). Si no está en el catálogo se deja tal cual.
 */
async function nombreSucursal(valor) {
  if (!valor) return null;
  try {
    const v = valor.trim().toUpperCase();
    const t = (await tiendasRepo.listarTiendasActivas()).find((x) => x.Codigo.toUpperCase() === v || x.Nombre.toUpperCase() === v);
    return t ? t.Nombre : valor;
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
    if (err instanceof FechaInvalidaError) throw badRequest(err.message, { code: 'FECHA_INVALIDA' });
    throw badRequest('No se pudo leer el Excel. Verifica que no esté dañado ni protegido con contraseña.');
  }

  const codigos = [...new Set(parsed.lineas.map((l) => l.codigoBarra))];
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
    fechaRegistro: parsed.fechaRegistro,
    numeroEmbarqueFactura: parsed.numeroEmbarqueFactura,
    ...auto,
    tipoSugerido: parsed.tipoSugerido,
    desglose: parsed.desglose,
    lineasTotal: parsed.lineas.length,
    lineasSinMotivo: parsed.lineasSinMotivo,
    // Las filas con las columnas de la plantilla: son el formulario de productos.
    filas: parsed.lineas.slice(0, MAX_FILAS_FORM).map((l) => ({
      posicion: l.posicion,
      ...l.cedi,
      codigoBarra: l.codigoBarra,
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

// ------------------------------------------------------------------
// PDF de los documentos SAP
// ------------------------------------------------------------------

/** "0004904487300" y "4904487300" son el mismo documento: solo dígitos, sin ceros a la izquierda. */
export function normalizarDocSap(valor) {
  const texto = String(valor ?? '').trim();
  const digitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digitos || texto.toUpperCase();
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
 * impreso el número de uno de esos documentos. Devuelve los adjuntos a guardar.
 */
async function validarPdfsSap(docs, pdfs, usuario) {
  const esperados = new Map(docs.map((d) => [normalizarDocSap(d), d]));
  const cubiertos = new Set();
  const adjuntos = [];
  for (const f of pdfs) {
    const nombre = path.basename(f.originalname || f.filename).slice(0, 255);
    if ((await tipoRealDeArchivo(f)) !== 'pdf') throw badRequest(`«${nombre}» no es un PDF válido.`);
    const numero = await numeroDocumentoPdf(f.path);
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
  return adjuntos;
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

  // Al menos 1 documento SAP entre los 3 fijos + los extra. Se compactan en
  // orden: los 3 primeros llenos van a SapDoc1..3, el resto a SapDocsExtra.
  const docs = [data.sapDoc1, data.sapDoc2, data.sapDoc3, ...data.sapDocsExtra].filter(Boolean);
  if (!docs.length && !SAP_DOC_OPCIONAL) throw badRequest('Ingresa al menos un documento SAP.');
  return { ...data, sapDoc1: docs[0], sapDoc2: docs[1], sapDoc3: docs[2], sapDocsExtra: docs.slice(3) };
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
      codigoBarra: l.codigoBarra,
      cantidad: l.cantidad,
      descripcion: l.descripcion,
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
      try {
        lineas = construirLineas(parsearPlantilla(buffer), data.tipo);
      } catch (err) {
        // Una fecha inválida es un error de validación del Excel, no "sin detalle".
        if (err instanceof FechaInvalidaError) throw badRequest(err.message, { code: 'FECHA_INVALIDA' });
        logger.warn({ err: err.message }, 'Reclamo creado sin líneas: no se pudo extraer el detalle del Excel');
      }
    }

    // División y motivo: si es un valor nuevo queda guardado en su catálogo; si
    // ya existía (con otras mayúsculas), se usa como está escrito allí. Va
    // después de validar el Excel para no registrar valores de un reclamo que
    // no se llega a crear.
    const autor = nombreUsuario(usuario);
    if (data.origen !== 'cedi') data.division = '';
    if (data.division) data.division = await repo.asegurarValorCatalogo('division', data.division, autor);
    if (data.motivo) data.motivo = await repo.asegurarValorCatalogo('motivo', data.motivo, autor);

    // Un PDF por cada documento SAP, con el mismo número impreso.
    const adjuntosSap = await validarPdfsSap([data.sapDoc1, data.sapDoc2, data.sapDoc3, ...data.sapDocsExtra].filter(Boolean), pdfs, usuario);

    const token = crypto.randomUUID();
    await repo.crear(
      {
        ...data,
        adjuntosExtra: adjuntosSap,
        token,
        status: TIPOS_SOLO_NOTIFICACION.has(data.tipo) ? 'notificado' : 'pendiente',
        archivoExcel: multerFile ? multerFile.filename : null,
        archivoExcelNombre: multerFile ? path.basename(multerFile.originalname || '').slice(0, 255) : null,
        createdBy: nombreUsuario(usuario),
      },
      lineas
    );
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

    return detalle(token);
  } catch (err) {
    await borrarArchivos(archivosCreados);
    throw err;
  }
}

// ------------------------------------------------------------------
// Decisiones
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// Adjuntos extra
// ------------------------------------------------------------------

/**
 * Quien decide o tiene "Adjuntar en cualquier reclamo" (Torre de Control), o
 * quien creó el reclamo (sube sus adjuntos justo después de crearlo). Y solo
 * mientras el reclamo siga abierto y sin enviar a contabilidad. Se usa
 * también como middleware ANTES de multer, para no guardar el archivo de
 * quien no puede adjuntar.
 */
export async function verificarPuedeAdjuntar(token, usuario) {
  const r = await obtenerOFallar(token);
  const esCreador = r.CreatedBy === nombreUsuario(usuario) && tienePermiso(usuario, 'reclamos.crear');
  if (!permisos(usuario).puedeAdjuntar && !esCreador) {
    throw forbidden('Solo quien creó el reclamo, quien puede aprobarlo o quien tiene el permiso "Adjuntar en cualquier reclamo" puede adjuntar archivos.');
  }
  asegurarModificable(r, 'adjuntos', { agregaTorreControl: tienePermiso(usuario, 'reclamos.adjuntar') });
  return r;
}

/** "#3 7501234567890 TROUSERS BOY, RED, 7" para los mensajes de error. */
const describirProducto = (l) => [`#${l.posicion}`, l.codigoBarra, l.descripcion].filter(Boolean).join(' ');
/** Hasta 10 productos; del resto solo se dice cuántos son. */
const listaProductos = (ls) => ls.slice(0, 10).map(describirProducto).join(' · ') + (ls.length > 10 ? ` · y ${ls.length - 10} más` : '');

/**
 * Una nota de débito (PDF de SAP) solo puede traer productos que la
 * compradora aprobó. Si trae uno rechazado o todavía sin decidir, no se
 * adjunta. Un PDF que no es nota de débito (sin tabla de productos) no se valida aquí.
 */
async function validarPdfContraDecisiones(token, rutaPdf) {
  const nota = await leerNotaPdf(rutaPdf);
  if (!nota.legible) return { notaAprobada: false };
  const { lineas } = cruzar(nota.filas, await repo.listarLineas(token));
  const enReclamo = lineas.filter((l) => l.lineaId !== null);
  const noEnReclamo = lineas.filter((l) => l.lineaId === null);
  const rechazados = enReclamo.filter((l) => l.decision === 'rechazado');
  const sinAprobar = enReclamo.filter((l) => l.decision === null);
  const doc = nota.numeroDocumento ? ` (documento ${nota.numeroDocumento})` : '';
  if (rechazados.length) {
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${rechazados.length} producto(s) rechazado(s) por la compradora: ${listaProductos(rechazados)}.`,
      { code: 'PDF_PRODUCTO_RECHAZADO', productos: rechazados.map((l) => l.posicion) }
    );
  }
  if (sinAprobar.length) {
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${sinAprobar.length} producto(s) que la compradora aún no aprueba: ${listaProductos(sinAprobar)}.`,
      { code: 'PDF_PRODUCTO_SIN_APROBAR', productos: sinAprobar.map((l) => l.posicion) }
    );
  }
  if (noEnReclamo.length) {
    const lista = noEnReclamo.slice(0, 10).map((l) => l.descripcion || l.material).join(' · ') + (noEnReclamo.length > 10 ? ` · y ${noEnReclamo.length - 10} más` : '');
    throw badRequest(
      `Documento SAP debe coincidir con los productos aprobados${doc}. Trae ${noEnReclamo.length} producto(s) que no están en este reclamo: ${lista}.`,
      { code: 'PDF_PRODUCTO_NO_EN_RECLAMO' }
    );
  }
  // Nota válida: trae productos del reclamo y todos están aprobados.
  return { notaAprobada: enReclamo.length > 0, documentoSap: nota.numeroDocumento || null };
}

export async function agregarAdjunto(token, multerFile, usuario) {
  if (!multerFile) throw badRequest('Selecciona un archivo Excel o PDF.');
  const creados = [multerFile.filename];
  try {
    await verificarPuedeAdjuntar(token, usuario);

    const tipo = await tipoRealDeArchivo(multerFile);
    if (!tipo) throw badRequest('El archivo no es un Excel o PDF válido.');
    const nota = tipo === 'pdf' ? await validarPdfContraDecisiones(token, multerFile.path) : null;

    const adj = {
      filename: multerFile.filename,
      originalname: path.basename(multerFile.originalname || multerFile.filename).slice(0, 255),
      tipo: tipo === 'pdf' ? 'pdf' : 'excel',
      ...(nota?.notaAprobada && { notaAprobada: true, documentoSap: nota.documentoSap }),
      uploaded_at: new Date().toISOString(),
      uploaded_by: nombreUsuario(usuario),
    };

    // Las fotos del adjunto quedan con origen = SU filename, para no mezclarse
    // con las del Excel principal ni con las de otros adjuntos.
    let imagenes = [];
    if (tipo === 'xlsx') {
      try {
        imagenes = await extraerImagenesExcel(multerFile.path, adj.filename);
        creados.push(...imagenes.map((i) => i.filename));
      } catch (err) {
        logger.warn({ err: err.message }, 'No se pudieron extraer las fotos del adjunto');
      }
    }

    // Se vuelve a comprobar bajo el bloqueo de la fila (envío/cierre en paralelo).
    const agregaTorreControl = tienePermiso(usuario, 'reclamos.adjuntar');
    const res = await repo.modificarArchivos(token, (a, estado) => {
      asegurarModificable(estado, 'adjuntos', { agregaTorreControl });
      return { imagenes: [...a.imagenes, ...imagenes], adjuntos: [...a.adjuntos, adj] };
    });
    if (!res) throw notFound('Reclamo no encontrado.');
    creados.length = 0;
    return detalle(token);
  } catch (err) {
    await borrarArchivos(creados);
    throw err;
  }
}

export async function eliminarAdjunto(token, idx) {
  validarToken(token);
  const i = validarIndice(idx);
  let aBorrar = [];
  const res = await repo.modificarArchivos(token, (a, estado) => {
    exigir(dominio.motivoNoEliminarAdjunto(estado));
    const adj = a.adjuntos[i];
    if (!adj) return null;
    const fotos = a.imagenes.filter((img) => img.origen === adj.filename);
    aBorrar = [adj.filename, ...fotos.map((f) => f.filename)];
    return {
      adjuntos: a.adjuntos.filter((_, j) => j !== i),
      imagenes: a.imagenes.filter((img) => img.origen !== adj.filename),
    };
  });
  if (!res) throw notFound('Reclamo no encontrado.');
  if (!aBorrar.length) throw notFound('Adjunto no encontrado.');
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  await borrarArchivos(aBorrar);
  return detalle(token);
}

// ------------------------------------------------------------------
// Envío a contabilidad
//   Cuando la compradora ya cerró el reclamo (resuelto o rechazado), lo
//   envía por correo a los usuarios con "Recibir reclamos en contabilidad":
//   datos, decisión, productos y TODOS los archivos (Excel del reclamo y
//   adjuntos PDF/Excel), cada uno con el número del reclamo en el nombre.
//   Va con copia a la compradora, que queda como "Responder a".
// ------------------------------------------------------------------

const PERMISO_CONTABILIDAD = 'reclamos.contabilidad';

/** "Reclamo REC-000005 - factura.pdf" (sin repetir el prefijo si ya lo trae). */
function nombreDeReclamo(numero, nombre) {
  const limpio = path.basename(nombre || '').trim() || 'archivo';
  return limpio.toLowerCase().startsWith(`reclamo ${numero}`.toLowerCase()) ? limpio : `Reclamo ${numero} - ${limpio}`;
}

async function archivosParaContabilidad(r) {
  const numero = numeroReclamo(r.ReclamoId);
  const candidatos = [];
  if (r.ArchivoExcel) {
    candidatos.push({
      guardado: r.ArchivoExcel,
      nombre: nombreDeReclamo(numero, r.ArchivoExcelNombre || `Excel${path.extname(r.ArchivoExcel)}`),
      descripcion: 'Excel del reclamo',
    });
  }
  for (const a of parseJsonArray(r.AdjuntosExtra)) {
    candidatos.push({
      guardado: a.filename,
      nombre: nombreDeReclamo(numero, a.originalname || a.filename),
      descripcion: a.tipo === 'pdf' ? 'PDF del reclamo' : 'Excel adjunto del reclamo',
    });
  }
  const archivos = [];
  const faltantes = [];
  let total = 0;
  for (const c of candidatos) {
    const ruta = reclamoArchivoPath(c.guardado);
    const st = await fs.stat(ruta).catch(() => null);
    if (!st) {
      faltantes.push(c.nombre);
      continue;
    }
    total += st.size;
    archivos.push({ filename: c.nombre, path: ruta, descripcion: c.descripcion });
  }
  return { archivos, faltantes, total };
}

export async function enviarAContabilidad(token, usuario) {
  const r = await obtenerOFallar(token);
  exigir(dominio.motivoNoEnviarContabilidad(r, parseJsonArray(r.AdjuntosExtra)));
  const para = await destinatarios(PERMISO_CONTABILIDAD);
  if (!para.length) {
    throw badRequest(
      'No hay a quién enviarlo: ningún usuario con correo tiene un rol con el permiso "Recibir reclamos en contabilidad". Asígnalo en Configuración.'
    );
  }
  const { archivos, faltantes, total } = await archivosParaContabilidad(r);
  if (faltantes.length) {
    throw conflict(`Faltan archivos del reclamo en el servidor y no se puede enviar completo: ${faltantes.join(', ')}.`);
  }
  if (total > env.correo.maxAdjuntosMb * 1024 * 1024) {
    throw badRequest(
      `Los archivos del reclamo suman ${(total / 1048576).toFixed(1)} MB y el máximo para un correo es ${env.correo.maxAdjuntosMb} MB.`
    );
  }

  const [dto] = await conNombres([aDto(r)]);
  const lineas = await repo.listarLineas(token);
  const remitente = await datosDeUsuario(nombreUsuario(usuario));
  if (!remitente.nombre || remitente.nombre === nombreUsuario(usuario)) remitente.nombre = usuario.name || remitente.nombre;

  // Notas de débito (PDF adjuntos) leídas y cruzadas con los productos, para
  // el correo. Si algo falla, el correo sale igual sin esa sección.
  let documentos = null;
  try {
    documentos = await calcularDocumentos(r, lineas);
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'No se pudieron leer los documentos del reclamo para el correo a contabilidad');
  }

  const { asunto, html, texto } = plantillaReclamoContabilidad(dto, lineas, { remitente, archivos, documentos: documentos ?? [] });
  const cc = remitente.correo && !para.includes(remitente.correo) ? [remitente.correo] : [];
  const envio = await enviarCorreo({
    para,
    cc,
    responderA: remitente.correo,
    asunto,
    html,
    texto,
    adjuntos: archivos.map(({ filename, path: ruta }) => ({ filename, path: ruta })),
  });

  // El correo ya salió: si falla el registro no se responde error (el usuario
  // reintentaría y contabilidad recibiría el reclamo dos veces).
  try {
    const registrado = await repo.registrarEnvioContabilidad(token, { usuario: nombreUsuario(usuario), para: para.join(', ') });
    if (!registrado) {
      logger.warn({ reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero no se registró el envío (cambió de estado o ya no existe)');
    }
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero falló el registro del envío');
  }
  // Bandeja de contabilidad: un documento por PDF adjunto. Igual que arriba,
  // si falla no se responde error (el correo ya salió).
  try {
    // Si no se pudieron calcular antes del correo, se reintenta aquí.
    await sincronizarDocumentos(token, nombreUsuario(usuario), { documentos: documentos ?? undefined });
  } catch (err) {
    logger.error({ err, reclamo: dto.Numero }, 'Reclamo enviado a contabilidad pero falló el guardado de sus documentos en la bandeja');
  }
  logger.info({ reclamo: dto.Numero, para, cc, archivos: archivos.map((a) => a.filename) }, 'Reclamo enviado a contabilidad');
  return { ...(await detalle(token)), envio: { para, cc, aceptados: envio.aceptados, rechazados: envio.rechazados } };
}

// ------------------------------------------------------------------
// Eliminar reclamo completo
// ------------------------------------------------------------------

export async function eliminar(token, usuario) {
  // La regla se revisa dentro de la transacción del DELETE, con la fila bloqueada (UPDLOCK).
  const res = await repo.eliminar(validarToken(token), (estado) => dominio.motivoNoModificable(estado, 'eliminar'));
  if (!res) throw notFound('Reclamo no encontrado.');
  exigir(res.bloqueado);
  const borrado = res.fila;
  // Solo después del commit: si la BD falla, los archivos siguen referenciados.
  await borrarArchivos([
    borrado.ArchivoExcel,
    ...parseJsonArray(borrado.ImagenesExcel).map((i) => i.filename),
    ...parseJsonArray(borrado.AdjuntosExtra).map((a) => a.filename),
  ]);
  logger.info({ token, reclamo: numeroReclamo(borrado.ReclamoId), usuario: nombreUsuario(usuario) }, 'Reclamo eliminado');
}
