// Consultas de Reclamos: permisos del usuario, lista, detalle y archivos.
import path from 'node:path';
import * as repo from '../../repositories/reclamosRepository.js';
import { parseJsonArray } from '../../repositories/reclamosRepository.js';
import { CONTENT_TYPE_IMAGEN } from './excelImages.js';
import { reclamoArchivoPath } from '../../config/almacenamiento.js';
import { tienePermiso } from '../acceso/permisos.js';
import { compradoraDe } from '../acceso/alcanceCompradora.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';
import { notFound } from '../../utils/httpError.js';
import { validarIndice, indiceAdjunto, obtenerOFallar, numeroReclamo, aDto, conNombres, nombreUsuario } from './comun.js';

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
    // Devolver a quien lo creó: quien decide (la compradora). Corregir y reenviar: quien lo creó o el super administrador.
    puedeDevolver: puedeDecidir,
    puedeCorregirCualquiera: tienePermiso(usuario, 'configuracion.administrar'),
    // Reclamos de devolución: marcar que el proveedor ya retiró el producto (Gof).
    puedeRegistrarRetiro: tienePermiso(usuario, 'reclamos.retiro_proveedor'),
    esAdmin: puedeDecidir,
    username: nombreUsuario(usuario),
  };
}

export async function listar(query, usuario) {
  const pagination = parsePagination(query);
  const compradora = await compradoraDe(usuario);
  const filtros = { status: query.status || undefined, porEnviar: query.porEnviar === '1', q: query.q?.trim() || undefined, compradora };
  const [{ items, total }, kpis] = await Promise.all([repo.listar(filtros, pagination), repo.obtenerKpis(usuario ? nombreUsuario(usuario) : null, compradora)]);
  return { data: await conNombres(items.map(aDto)), pagination: buildPaginationMeta({ ...pagination, total }), kpis };
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

/** `f` (opcional): nombre en disco del adjunto, por si la posición cambió (ver indiceAdjunto). */
export async function adjunto(token, idx, f) {
  const r = await obtenerOFallar(token);
  const adjuntos = parseJsonArray(r.AdjuntosExtra);
  const adj = adjuntos[indiceAdjunto(adjuntos, idx, f)];
  if (!adj) throw notFound('Adjunto no encontrado.');
  const ext = path.extname(adj.filename).toLowerCase();
  const contentType =
    adj.tipo === 'pdf'
      ? 'application/pdf'
      : adj.tipo === 'imagen'
        ? CONTENT_TYPE_IMAGEN[ext.slice(1).replace('jpeg', 'jpg')] || 'application/octet-stream'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return { ruta: reclamoArchivoPath(adj.filename), nombre: adj.originalname || adj.filename, contentType };
}
