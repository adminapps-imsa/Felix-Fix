import { api, fetchBlob } from './client';
import type { CatalogosReporte, VistaPreviaCorreo, Filtros, Kpis, PaginationMeta, ReporteDetalle, ReporteProductoDanado } from '../types/productoDanado';

function buildQuery(filtros: Filtros): string {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listarReportes(filtros: Filtros) {
  return api.get<{ data: ReporteProductoDanado[]; pagination: PaginationMeta }>(
    `/productos-danados${buildQuery(filtros)}`
  );
}

export function obtenerKpis(filtros: Filtros) {
  return api.get<Kpis>(`/productos-danados/kpis${buildQuery(filtros)}`);
}

export function obtenerDetalle(id: number) {
  return api.get<ReporteDetalle>(`/productos-danados/${id}`);
}

export function crearReporte(form: FormData) {
  return api.postForm<ReporteDetalle>('/productos-danados', form);
}

export function aprobarReporte(id: number) {
  return api.patch<ReporteDetalle>(`/productos-danados/${id}/aprobar`);
}

export function rechazarReporte(id: number, motivoRechazo: string) {
  return api.patch<ReporteDetalle>(`/productos-danados/${id}/rechazar`, { motivoRechazo });
}

export function procesarReporte(id: number) {
  return api.post<ReporteDetalle>(`/productos-danados/${id}/procesar`);
}

export function evidenciaPath(id: number) {
  return `/productos-danados/${id}/evidencia`;
}

export const listarCatalogos = () => api.get<CatalogosReporte>('/productos-danados/catalogos');

export const guardarCorreos = (id: number, correos: string[]) =>
  api.put<ReporteDetalle>(`/productos-danados/${id}/correos`, { correos });

export function subirAdjunto(id: number, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<ReporteDetalle>(`/productos-danados/${id}/adjuntos`, form);
}

export const eliminarAdjunto = (id: number, idx: number) => api.del<ReporteDetalle>(`/productos-danados/${id}/adjuntos/${idx}`);

export const descargarAdjunto = (id: number, idx: number) => fetchBlob(`/productos-danados/${id}/adjuntos/${idx}`);

export const vistaPreviaCorreo = (id: number) => api.get<VistaPreviaCorreo>(`/productos-danados/${id}/correo/vista-previa`);

export interface ResultadoEnvioProveedor extends ReporteDetalle {
  envio?: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
export const enviarAlProveedor = (id: number) => api.post<ResultadoEnvioProveedor>(`/productos-danados/${id}/correo/enviar`);

export const eliminarReporte = (id: number) => api.del<void>(`/productos-danados/${id}`);

/** NF: Gof confirma el documento 1700 con su número y lo pasa al supervisor GOF. */
export const registrarDocumento1700 = (id: number, numero: string) =>
  api.patch<ReporteDetalle>(`/productos-danados/${id}/documento-1700`, { confirmado: true, numero });

export const cerrarNf = (id: number, comentario: string) => api.patch<ReporteDetalle>(`/productos-danados/${id}/cerrar-nf`, { comentario });

export function subirDocumentoGof(id: number, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<ReporteDetalle>(`/productos-danados/${id}/documentos-gof`, form);
}

export const enviarAContabilidad = (id: number) => api.patch<ReporteDetalle>(`/productos-danados/${id}/enviar-contabilidad`);

export const registrarPago = (id: number, referencia: string, comentario: string) =>
  api.patch<ReporteDetalle>(`/productos-danados/${id}/pago-recibido`, { referencia, comentario });
