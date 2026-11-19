import { api, fetchBlob } from './client';
import type { PaginationMeta } from '../types/productoDanado';
import type { DocumentoContabilidad, DocumentoContabilidadDetalle, DecisionContabilidad, FiltroEstadoContabilidad, RespuestaProveedor, VistaPreviaCorreoProveedor } from '../types/contabilidad';

const BASE = '/contabilidad/documentos';

export function listarDocumentos(filtros: { estado?: FiltroEstadoContabilidad; q?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return api.get<{ data: DocumentoContabilidad[]; pagination: PaginationMeta }>(`${BASE}${qs ? `?${qs}` : ''}`);
}

export const obtenerDocumento = (id: number | string) => api.get<DocumentoContabilidadDetalle>(`${BASE}/${encodeURIComponent(String(id))}`);

/** Envío de la nota de débito al proveedor: correos que escribe contabilidad y un comentario que va en el correo. */
export type DatosCorreoProveedor = { correos: string[]; comentario: string };

/** Vista previa: de los archivos extra solo se mandan nombre y tamaño. */
export const vistaPreviaCorreoProveedor = (id: number, datos: DatosCorreoProveedor, adjuntos: File[] = []) =>
  api.post<VistaPreviaCorreoProveedor>(`${BASE}/${id}/correo-proveedor/vista-previa`, {
    ...datos,
    adjuntos: adjuntos.map((f) => ({ nombre: f.name, size: f.size })),
  });

export interface ResultadoEnvioProveedor extends DocumentoContabilidadDetalle {
  envio?: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
/** Envío: multipart con los correos (JSON), el comentario y los archivos extra. */
export function enviarCorreoProveedor(id: number, datos: DatosCorreoProveedor, adjuntos: File[] = []) {
  const form = new FormData();
  form.set('correos', JSON.stringify(datos.correos));
  form.set('comentario', datos.comentario);
  adjuntos.forEach((f) => form.append('adjuntos', f));
  return api.postForm<ResultadoEnvioProveedor>(`${BASE}/${id}/correo-proveedor/enviar`, form);
}

/** Respuesta del proveedor: aprobado o no, con el registro SAP (obligatorio) y el documento SAP (opcional). */
export function registrarRespuesta(id: number, datos: { respuesta: RespuestaProveedor; registroSap: string; archivo: File | null }) {
  const form = new FormData();
  form.set('respuesta', datos.respuesta);
  form.set('registroSap', datos.registroSap);
  if (datos.archivo) form.set('archivo', datos.archivo);
  return api.postForm<DocumentoContabilidadDetalle>(`${BASE}/${id}/respuesta`, form);
}
export const quitarRespuesta = (id: number) => api.del<DocumentoContabilidadDetalle>(`${BASE}/${id}/respuesta`);
export const descargarArchivoRespuesta = (id: number) => fetchBlob(`${BASE}/${id}/respuesta/archivo`);

/** Reclamar o no al proveedor; «no reclamar» lleva el motivo. */
export const decidirReclamo = (id: number, decision: DecisionContabilidad, comentario = '') =>
  api.post<DocumentoContabilidadDetalle>(`${BASE}/${id}/decision`, { decision, comentario });
export const quitarDecision = (id: number) => api.del<DocumentoContabilidadDetalle>(`${BASE}/${id}/decision`);
