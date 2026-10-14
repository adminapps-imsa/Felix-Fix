import { api, fetchBlob } from './client';
import type { PaginationMeta } from '../types/productoDanado';
import type {
  CatalogosReclamo,
  DecStatus,
  KpisReclamos,
  PermisosReclamos,
  PreviewExcel,
  Reclamo,
  ReclamoLinea,
  RelacionProveedor,
  StatusReclamo,
} from '../types/reclamo';

const BASE = '/reclamos';

export function listarReclamos(filtros: { status?: StatusReclamo | ''; porEnviar?: boolean; q?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (k === 'porEnviar') {
      if (v) params.set(k, '1');
    } else if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return api.get<{ data: Reclamo[]; pagination: PaginationMeta; kpis: KpisReclamos }>(`${BASE}${qs ? `?${qs}` : ''}`);
}

export const obtenerPermisos = () => api.get<PermisosReclamos>(`${BASE}/permisos`);
export const listarCatalogos = () => api.get<CatalogosReclamo>(`${BASE}/catalogos`);
export const relacionProveedor = (nombre: string) =>
  api.get<RelacionProveedor | null>(`${BASE}/proveedor?nombre=${encodeURIComponent(nombre)}`);
export const obtenerReclamo = (token: string) => api.get<Reclamo>(`${BASE}/${token}`);
export const obtenerLineas = (token: string) => api.get<ReclamoLinea[]>(`${BASE}/${token}/lineas`);
export const decidirLineas = (token: string, posiciones: number[], decision: 'aprobado' | 'rechazado', comentario: string) =>
  api.post<{ actualizadas: number; omitidas: number; lineas: ReclamoLinea[] }>(`${BASE}/${token}/lineas/decision`, {
    posiciones,
    decision,
    comentario,
  });

export function previsualizarExcel(excel: File) {
  const form = new FormData();
  form.set('excel', excel);
  return api.postForm<PreviewExcel>(`${BASE}/parse-excel`, form);
}

/** Número de documento SAP impreso en el PDF (null si no se encontró). */
export function previsualizarPdfSap(pdf: File) {
  const form = new FormData();
  form.set('pdf', pdf);
  return api.postForm<{ numeroDocumento: string | null }>(`${BASE}/parse-pdf`, form);
}

export const crearReclamo = (form: FormData) => api.postForm<Reclamo>(BASE, form);

export function subirAdjunto(token: string, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<Reclamo>(`${BASE}/${token}/adjuntos`, form);
}

export const eliminarAdjunto = (token: string, idx: number) => api.del<Reclamo>(`${BASE}/${token}/adjuntos/${idx}`);
export const eliminarReclamo = (token: string) => api.del<void>(`${BASE}/${token}`);

export const decidirReclamo = (token: string, status: 'resuelto' | 'rechazado', comentario: string) =>
  api.patch<Reclamo>(`${BASE}/${token}/decision`, { status, comentario });

export interface ResultadoEnvioContabilidad extends Reclamo {
  envio: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
export const enviarAContabilidad = (token: string) => api.post<ResultadoEnvioContabilidad>(`${BASE}/${token}/enviar-contabilidad`, {});

export const decidirLinea = (token: string, pos: number, decision: Exclude<DecStatus, 'pendiente'>, comentario: string) =>
  api.post<ReclamoLinea>(`${BASE}/${token}/lineas/${pos}/decision`, { decision, comentario });

export const deshacerLinea = (token: string, pos: number) =>
  api.del<ReclamoLinea>(`${BASE}/${token}/lineas/${pos}/decision`);

export const descargarExcel = (token: string) => fetchBlob(`${BASE}/${token}/excel`);
export const descargarAdjunto = (token: string, idx: number) => fetchBlob(`${BASE}/${token}/adjuntos/${idx}`);
export const imagenPath = (token: string, idx: number) => `${BASE}/${token}/imagen/${idx}`;
