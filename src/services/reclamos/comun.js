// Utilidades compartidas por los casos de uso de Reclamos: validar el token,
// leer el reclamo, armar el DTO con nombres y traducir las reglas del dominio
// (src/domain/reclamo.js) a errores HTTP.
import { detectarTipoArchivo } from '../../utils/tipoArchivo.js';
import * as repo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import * as dominio from '../../domain/reclamo.js';
import { nombresDeUsuarios } from '../acceso/keycloakAdmin.js';
import { conflict, notFound } from '../../utils/httpError.js';

const RE_UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export function validarToken(token) {
  if (!RE_UUID.test(String(token || ''))) throw notFound('Reclamo no encontrado.');
  return token;
}

export function validarIndice(idx) {
  const n = Number(idx);
  if (!Number.isInteger(n) || n < 0) throw notFound('Archivo no encontrado.');
  return n;
}

export async function obtenerOFallar(token) {
  const reclamo = await repo.obtenerPorToken(validarToken(token));
  if (!reclamo) throw notFound('Reclamo no encontrado.');
  return reclamo;
}

/** Magic bytes: el MIME del navegador no es confiable. xlsx = 'xlsx', xls = 'cfb'. */
export function tipoReal(detected) {
  if (!detected) return null;
  if (detected.ext === 'xlsx') return 'xlsx';
  if (detected.ext === 'cfb') return 'xls';
  if (detected.ext === 'pdf') return 'pdf';
  return null;
}

export async function tipoRealDeArchivo(multerFile) {
  return tipoReal(await detectarTipoArchivo(multerFile.path));
}

export const estadoNotaAprobada = (r) => dominio.estadoNotaAprobada(r, parseJsonArray(r.AdjuntosExtra));

/** Traduce el motivo de una regla del dominio (o null) a 409. */
export function exigir(motivo) {
  if (motivo) throw conflict(motivo.mensaje, motivo.code && { code: motivo.code });
}

function todosLosDocsSap(r) {
  return [r.SapDoc1, r.SapDoc2, r.SapDoc3, ...parseJsonArray(r.SapDocsExtra)].filter((d) => d && String(d).trim());
}

export function numeroReclamo(id) {
  return `REC-${String(id).padStart(6, '0')}`;
}

export function aDto(r) {
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
export async function conNombres(dtos) {
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

export async function lineasConNombres(lineas) {
  const nombres = await nombresDeUsuarios(lineas.map((l) => l.DecBy));
  return lineas.map((l) => ({ ...l, DecByNombre: l.DecBy ? nombres.get(l.DecBy) || l.DecBy : null }));
}

export function nombreUsuario(usuario) {
  return usuario.username || usuario.sub;
}

/** Regla del dominio: ya enviado a contabilidad o cerrado → 409 con el motivo. */
export const asegurarModificable = (estado, accion, opciones) => exigir(dominio.motivoNoModificable(estado, accion, opciones));

export async function detalle(token) {
  const [dto] = await conNombres([aDto(await obtenerOFallar(token))]);
  return dto;
}
