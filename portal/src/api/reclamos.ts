import { api, fetchBlob } from './client';
import type { PaginationMeta } from '../types/productoDanado';
import type {
  ArticuloData,
  CatalogosReclamo,
  DecStatus,
  DocumentoSapUsado,
  KpisReclamos,
  PermisosReclamos,
  PreviewExcel,
  Reclamo,
  ReclamoLinea,
  RelacionProveedor,
  FiltroStatusReclamo,
  HistorialReclamo,
  TipoReclamo,
} from '../types/reclamo';

const BASE = '/reclamos';

/** Segmento de la URL de un reclamo (el token va codificado). */
const ruta = (token: string) => `${BASE}/${encodeURIComponent(token)}`;
/** `?f=`: el nombre interno del adjunto; el backend lo usa para no borrar o bajar otro si cambió el orden. */
const conArchivo = (filename?: string) => (filename ? `?f=${encodeURIComponent(filename)}` : '');

/** `tienda`: 'cedi' o el TiendaId de una tienda (por la sucursal del reclamo). */
export function listarReclamos(filtros: { status?: FiltroStatusReclamo | ''; porEnviar?: boolean; q?: string; tienda?: string; page?: number; pageSize?: number }) {
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

/** Administrador: cambia el Excel del reclamo (el backend valida que traiga los mismos productos). */
export function reemplazarExcel(token: string, archivo: File, ajustar = false) {
  const form = new FormData();
  // `ajustar`: el administrador confirmó ajustar los productos del reclamo al Excel.
  if (ajustar) form.set('ajustar', '1');
  form.set('excel', archivo);
  return api.putForm<Reclamo>(`${ruta(token)}/excel`, form);
}
/** Historial del reclamo (administrador y supervisor GOF). */
export const obtenerHistorial = (token: string) => api.get<HistorialReclamo>(`${ruta(token)}/historial`);

/** Administrador: quita el Excel del reclamo (y sus fotos). */
export const quitarExcel = (token: string) => api.del<Reclamo>(`${ruta(token)}/excel`);

export const eliminarAdjunto = (token: string, idx: number, filename?: string) =>
  api.del<Reclamo>(`${ruta(token)}/adjuntos/${idx}${conArchivo(filename)}`);
export const eliminarReclamo = (token: string) => api.del<void>(ruta(token));

export const decidirReclamo = (token: string, status: 'resuelto' | 'rechazado', comentario: string) =>
  api.patch<Reclamo>(`${ruta(token)}/decision`, { status, comentario });

export interface ResultadoEnvioContabilidad extends Reclamo {
  envio: { para: string[]; cc: string[]; aceptados: string[]; rechazados: string[] };
}
export const enviarAContabilidad = (token: string) => api.post<ResultadoEnvioContabilidad>(`${ruta(token)}/enviar-contabilidad`, {});

export const decidirLinea = (token: string, pos: number, decision: Exclude<DecStatus, 'pendiente'>, comentario: string, articulo?: ArticuloData) =>
  api.post<ReclamoLinea>(`${ruta(token)}/lineas/${pos}/decision`, { decision, comentario, ...(articulo && { articulo }) });

export const deshacerLinea = (token: string, pos: number) =>
  api.del<ReclamoLinea>(`${ruta(token)}/lineas/${pos}/decision`);

/** Data: código de barras del sobrante no esperado que ya creó en SAP (se valida contra SAP). */
export const cargarCodigoSap = (token: string, pos: number, codigoBarra: string) =>
  api.put<ReclamoLinea>(`${ruta(token)}/lineas/${pos}/codigo-sap`, { codigoBarra });

export const descargarExcel = (token: string) => fetchBlob(`${ruta(token)}/excel`);
export const descargarAdjunto = (token: string, idx: number, filename?: string) => fetchBlob(`${ruta(token)}/adjuntos/${idx}${conArchivo(filename)}`);
export const imagenPath = (token: string, idx: number) => `${ruta(token)}/imagen/${idx}`;

// Devolución a quien lo creó: la compradora lo devuelve con un comentario; quien lo creó corrige y lo reenvía.
export const devolverReclamo = (token: string, comentario: string) => api.post<Reclamo>(`${ruta(token)}/devolver`, { comentario });
export const devolverReclamoSupervisor = (token: string, comentario: string) => api.post<Reclamo>(`${ruta(token)}/devolver-supervisor`, { comentario });

/** Productos corregidos de un reclamo devuelto: `lineaId` en los que ya estaban; sin él, los nuevos. */
export interface LineaCorregida {
  lineaId?: number | null;
  codigoBarra: string;
  descripcion: string;
  cantidad: number | null;
  tipo: TipoReclamo;
}
export const corregirLineasReclamo = (token: string, lineas: LineaCorregida[]) => api.put<Reclamo>(`${ruta(token)}/lineas`, { lineas });
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

// Entrega al proveedor (reclamos que el proveedor retira): día + foto.
export function registrarRetiro(token: string, fecha: string, foto: File) {
  const form = new FormData();
  form.set('fecha', fecha);
  form.set('foto', foto);
  return api.postForm<Reclamo>(`${ruta(token)}/retiro`, form);
}
export const cambiarRetiro = (token: string, requerido: boolean) => api.put<Reclamo>(`${ruta(token)}/retiro/requerido`, { requerido });
export const quitarRetiro = (token: string) => api.del<Reclamo>(`${ruta(token)}/retiro`);
export const fotoRetiroPath = (token: string) => `${ruta(token)}/retiro/foto`;
