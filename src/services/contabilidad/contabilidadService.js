// Bandeja de contabilidad: consulta de los documentos (notas de débito) de
// los reclamos enviados a contabilidad. Las acciones de contabilidad sobre
// cada documento se definirán después; por ahora todos quedan 'pendiente'.
import * as repo from '../../repositories/contabilidadRepository.js';
import * as reclamosRepo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import { numeroReclamo } from '../reclamos/comun.js';
import { nombresDeUsuarios } from '../acceso/keycloakAdmin.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';
import { notFound } from '../../utils/httpError.js';

const VALIDACION_VACIA = {
  estado: 'sin_leer',
  coinciden: 0,
  noEnReclamo: 0,
  cantidadDistinta: 0,
  aprobados: 0,
  rechazados: 0,
  sinDecision: 0,
  mezclaDecisiones: false,
};

function parseJsonObjeto(valor) {
  if (!valor) return null;
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const aNumero = (v) => (v === null || v === undefined ? null : Number(v));
const aFecha = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const aIso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : null);

function validacionDto(valor) {
  const v = { ...VALIDACION_VACIA, ...(parseJsonObjeto(valor) || {}) };
  return {
    estado: v.estado,
    coinciden: Number(v.coinciden) || 0,
    noEnReclamo: Number(v.noEnReclamo) || 0,
    cantidadDistinta: Number(v.cantidadDistinta) || 0,
    aprobados: Number(v.aprobados) || 0,
    rechazados: Number(v.rechazados) || 0,
    sinDecision: Number(v.sinDecision) || 0,
    mezclaDecisiones: Boolean(v.mezclaDecisiones),
  };
}

/** Fila de la BD -> DocumentoContabilidad (sin Lineas). */
function aDto(d, nombres) {
  const idx = parseJsonArray(d.AdjuntosExtra).findIndex((a) => a?.filename === d.AdjuntoFilename);
  return {
    DocumentoId: Number(d.DocumentoId),
    ReclamoToken: d.ReclamoToken,
    ReclamoNumero: numeroReclamo(d.ReclamoId),
    Proveedor: d.Proveedor ?? null,
    NumeroEmbarqueFactura: d.NumeroEmbarqueFactura ?? null,
    Compradora: d.Compradora ?? null,
    NumeroDocumento: d.NumeroDocumento ?? null,
    TipoDocumento: d.TipoDocumento ?? null,
    Movimiento: d.Movimiento ?? null,
    FechaDocumento: aFecha(d.FechaDocumento),
    Total: aNumero(d.Total),
    Productos: parseJsonArray(d.Lineas).length,
    AdjuntoNombre: d.AdjuntoNombre || d.AdjuntoFilename,
    AdjuntoIdx: idx >= 0 ? idx : null,
    Validacion: validacionDto(d.Validacion),
    Estado: d.Estado,
    EnviadoAt: aIso(d.EnviadoAt),
    EnviadoPor: d.EnviadoPor ?? null,
    EnviadoPorNombre: d.EnviadoPor ? nombres.get(d.EnviadoPor) || d.EnviadoPor : null,
  };
}

export async function listar(query) {
  const pagination = parsePagination(query);
  const filtros = {
    estado: query.estado === 'todos' ? undefined : query.estado || 'pendiente',
    q: query.q?.trim() || undefined,
  };
  const { items, total } = await repo.listar(filtros, pagination);
  const nombres = await nombresDeUsuarios(items.map((d) => d.EnviadoPor));
  return { data: items.map((d) => aDto(d, nombres)), pagination: buildPaginationMeta({ ...pagination, total }) };
}

/** Línea guardada en el JSON -> LineaDocumento con números como number. */
function lineaDto(l) {
  return {
    material: l.material ?? null,
    descripcion: l.descripcion ?? null,
    cantidadPdf: aNumero(l.cantidadPdf),
    valor: aNumero(l.valor),
    lineaId: aNumero(l.lineaId),
    posicion: aNumero(l.posicion),
    codigoBarra: l.codigoBarra ?? null,
    tipo: l.tipo ?? null,
    decision: l.decision ?? null,
    cantidadReclamo: aNumero(l.cantidadReclamo),
    resultado: l.resultado,
  };
}

export async function detalle(id) {
  const documentoId = Number(id);
  if (!Number.isInteger(documentoId) || documentoId <= 0 || documentoId > 2147483647) throw notFound('Documento no encontrado.');
  const d = await repo.obtenerPorId(documentoId);
  if (!d) throw notFound('Documento no encontrado.');

  const [nombres, lineasReclamo, docsReclamo] = await Promise.all([
    nombresDeUsuarios([d.EnviadoPor]),
    reclamosRepo.listarLineas(d.ReclamoToken),
    repo.lineasDeReclamo(d.ReclamoId),
  ]);
  // Productos del reclamo que no aparecen en NINGÚN documento guardado del reclamo.
  const conDocumento = new Set(
    docsReclamo.flatMap((x) => parseJsonArray(x.Lineas).map((l) => l?.lineaId)).filter((v) => v !== null && v !== undefined).map(Number)
  );
  const reclamoSinDocumento = lineasReclamo
    .filter((l) => !conDocumento.has(Number(l.LineaId)))
    .map((l) => ({
      lineaId: Number(l.LineaId),
      posicion: Number(l.Posicion),
      codigoBarra: l.CodigoBarra,
      descripcion: l.DescripcionExcel ?? null,
      cantidad: aNumero(l.Cantidad),
      tipo: l.Tipo,
      decision: l.DecStatus === 'aprobado' || l.DecStatus === 'rechazado' ? l.DecStatus : null,
    }));

  return {
    ...aDto(d, nombres),
    Lineas: parseJsonArray(d.Lineas).map(lineaDto),
    ReclamoSinDocumento: reclamoSinDocumento,
    ReclamoStatus: d.ReclamoStatus,
    DecisionComentario: d.DecisionComentario ?? null,
  };
}
