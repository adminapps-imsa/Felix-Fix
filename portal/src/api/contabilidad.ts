import { api } from './client';
import type { PaginationMeta } from '../types/productoDanado';
import type { DocumentoContabilidad, DocumentoContabilidadDetalle, FiltroEstadoContabilidad } from '../types/contabilidad';

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
