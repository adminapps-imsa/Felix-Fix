import { api, fetchBlob } from './client';
import type { CatalogosReporte, VistaPreviaCorreo, Filtros, Kpis, PaginationMeta, ReporteDetalle, ReporteProductoDanado } from '../types/productoDanado';

/** Segmento de la URL de un reporte (codificado por si acaso; el id es numérico). */
const ruta = (id: number) => `/productos-danados/${encodeURIComponent(id)}`;
/** `?f=`: el nombre interno del adjunto; el backend lo usa para no borrar o bajar otro si cambió el orden. */
const conArchivo = (filename?: string) => (filename ? `?f=${encodeURIComponent(filename)}` : '');

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
  return api.get<ReporteDetalle>(ruta(id));
}

export function crearReporte(form: FormData) {
  return api.postForm<ReporteDetalle>('/productos-danados', form);
}

export function aprobarReporte(id: number) {
  return api.patch<ReporteDetalle>(`${ruta(id)}/aprobar`);
}

export function rechazarReporte(id: number, motivoRechazo: string) {
  return api.patch<ReporteDetalle>(`${ruta(id)}/rechazar`, { motivoRechazo });
}

export function procesarReporte(id: number) {
  return api.post<ReporteDetalle>(`${ruta(id)}/procesar`);
}

export function evidenciaPath(id: number) {
  return `${ruta(id)}/evidencia`;
}

export const listarCatalogos = () => api.get<CatalogosReporte>('/productos-danados/catalogos');

export const guardarCorreos = (id: number, correos: string[]) =>
  api.put<ReporteDetalle>(`${ruta(id)}/correos`, { correos });

export function subirAdjunto(id: number, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<ReporteDetalle>(`${ruta(id)}/adjuntos`, form);
}

export const eliminarAdjunto = (id: number, idx: number, filename?: string) =>
  api.del<ReporteDetalle>(`${ruta(id)}/adjuntos/${idx}${conArchivo(filename)}`);

export const descargarAdjunto = (id: number, idx: number, filename?: string) => fetchBlob(`${ruta(id)}/adjuntos/${idx}${conArchivo(filename)}`);

export const vistaPreviaCorreo = (id: number) => api.get<VistaPreviaCorreo>(`${ruta(id)}/correo/vista-previa`);

export interface ResultadoEnvioProveedor extends ReporteDetalle {
  envio?: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
export const enviarAlProveedor = (id: number) => api.post<ResultadoEnvioProveedor>(`${ruta(id)}/correo/enviar`);

export const eliminarReporte = (id: number) => api.del<void>(ruta(id));

/** NF: Gof marca el check «Documento 1700» y lo pasa al supervisor GOF. */
export const registrarDocumento1700 = (id: number) => api.patch<ReporteDetalle>(`${ruta(id)}/documento-1700`, { confirmado: true });

/** NF por validar: el supervisor GOF escribe el «Documento salida de NF» y cierra. */
export const cerrarNf = (id: number, numero: string, comentario: string) =>
  api.patch<ReporteDetalle>(`${ruta(id)}/cerrar-nf`, { numero, comentario });

export function subirDocumentoGof(id: number, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<ReporteDetalle>(`${ruta(id)}/documentos-gof`, form);
}

export const enviarAContabilidad = (id: number) => api.patch<ReporteDetalle>(`${ruta(id)}/enviar-contabilidad`);

export const registrarPago = (id: number, referencia: string, comentario: string) =>
  api.patch<ReporteDetalle>(`${ruta(id)}/pago-recibido`, { referencia, comentario });
