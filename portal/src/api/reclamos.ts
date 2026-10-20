import { api, fetchBlob } from './client';
import type { PaginationMeta } from '../types/productoDanado';
import type {
  CatalogosReclamo,
  DecStatus,
  DocumentoSapUsado,
  KpisReclamos,
  PermisosReclamos,
  PreviewExcel,
  Reclamo,
  ReclamoLinea,
  RelacionProveedor,
  StatusReclamo,
} from '../types/reclamo';

const BASE = '/reclamos';

/** Segmento de la URL de un reclamo (el token va codificado). */
const ruta = (token: string) => `${BASE}/${encodeURIComponent(token)}`;
/** `?f=`: el nombre interno del adjunto; el backend lo usa para no borrar o bajar otro si cambió el orden. */
const conArchivo = (filename?: string) => (filename ? `?f=${encodeURIComponent(filename)}` : '');

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
export const obtenerReclamo = (token: string) => api.get<Reclamo>(ruta(token));
export const obtenerLineas = (token: string) => api.get<ReclamoLinea[]>(`${ruta(token)}/lineas`);
export const decidirLineas = (token: string, posiciones: number[], decision: 'aprobado' | 'rechazado', comentario: string) =>
  api.post<{ actualizadas: number; omitidas: number; lineas: ReclamoLinea[] }>(`${ruta(token)}/lineas/decision`, {
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

/** En qué reclamos ya está cada documento SAP (un documento pertenece a un solo reclamo). */
export function documentosSapUsados(docs: string[]) {
  return api.get<{ usados: DocumentoSapUsado[] }>(`${BASE}/documentos-sap?docs=${encodeURIComponent(docs.join(','))}`);
}

export const crearReclamo = (form: FormData) => api.postForm<Reclamo>(BASE, form);

export function subirAdjunto(token: string, archivo: File) {
  const form = new FormData();
  form.set('archivo', archivo);
  return api.postForm<Reclamo>(`${ruta(token)}/adjuntos`, form);
}

export const eliminarAdjunto = (token: string, idx: number, filename?: string) =>
  api.del<Reclamo>(`${ruta(token)}/adjuntos/${idx}${conArchivo(filename)}`);
export const eliminarReclamo = (token: string) => api.del<void>(ruta(token));

export const decidirReclamo = (token: string, status: 'resuelto' | 'rechazado', comentario: string) =>
  api.patch<Reclamo>(`${ruta(token)}/decision`, { status, comentario });

export interface ResultadoEnvioContabilidad extends Reclamo {
  envio: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
export const enviarAContabilidad = (token: string) => api.post<ResultadoEnvioContabilidad>(`${ruta(token)}/enviar-contabilidad`, {});

export const decidirLinea = (token: string, pos: number, decision: Exclude<DecStatus, 'pendiente'>, comentario: string) =>
  api.post<ReclamoLinea>(`${ruta(token)}/lineas/${pos}/decision`, { decision, comentario });

export const deshacerLinea = (token: string, pos: number) =>
  api.del<ReclamoLinea>(`${ruta(token)}/lineas/${pos}/decision`);

export const descargarExcel = (token: string) => fetchBlob(`${ruta(token)}/excel`);
export const descargarAdjunto = (token: string, idx: number, filename?: string) => fetchBlob(`${ruta(token)}/adjuntos/${idx}${conArchivo(filename)}`);
export const imagenPath = (token: string, idx: number) => `${ruta(token)}/imagen/${idx}`;

// Devolución a quien lo creó: la compradora lo devuelve con un comentario; quien lo creó corrige y lo reenvía.
export const devolverReclamo = (token: string, comentario: string) => api.post<Reclamo>(`${ruta(token)}/devolver`, { comentario });
export const reenviarReclamo = (token: string, comentario: string) => api.post<Reclamo>(`${ruta(token)}/reenviar`, { comentario });

export interface DatosCorregibles {
  sucursal: string;
  numeroEmbarqueFactura: string;
  fechaRegistro: string;
  fechaLlegadaMercancia: string;
  mundo: string;
  departamento: string;
  marca: string;
  proveedor: string;
  compradora: string;
  division: string;
  sapDocs: string[];
}
export const corregirDatosReclamo = (token: string, datos: DatosCorregibles) => api.patch<Reclamo>(`${ruta(token)}/datos`, datos);

// Retiro del proveedor (reclamos de devolución): día + foto. No cambia el flujo.
export function registrarRetiro(token: string, fecha: string, foto: File) {
  const form = new FormData();
  form.set('fecha', fecha);
  form.set('foto', foto);
  return api.postForm<Reclamo>(`${ruta(token)}/retiro`, form);
}
export const quitarRetiro = (token: string) => api.del<Reclamo>(`${ruta(token)}/retiro`);
export const fotoRetiroPath = (token: string) => `${ruta(token)}/retiro/foto`;
