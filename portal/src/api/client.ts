import { clearSession, getToken, getVista } from '../auth/session';

/** Errores de validación de zod (`error.flatten()`) que manda el backend en `detalles`. */
export interface DetallesValidacion {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  /** Errores por campo cuando el backend responde "Datos inválidos." (400). */
  detalles?: DetallesValidacion;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
    this.detalles = (payload as { detalles?: DetallesValidacion } | undefined)?.detalles;
  }
}

// Nombre legible de los campos que valida el backend (si no está, se usa el nombre tal cual).
const CAMPO_LABEL: Record<string, string> = {
  tiendaId: 'tienda',
  empleadoReportaNombre: 'empleado que reporta',
  codigoBarras: 'código de barras',
  nombreProducto: 'nombre del producto',
  marca: 'marca',
  division: 'división',
  motivo: 'motivo',
  cantidad: 'cantidad',
  descripcion: 'descripción',
  motivoRechazo: 'motivo del NF',
  correos: 'correos',
  comentario: 'comentario',
  referencia: 'referencia',
};

/** "Datos inválidos." + errores por campo → "Datos inválidos: cantidad — Number must be greater than 0". */
function mensajeConDetalles(message: string, detalles?: DetallesValidacion): string {
  if (!detalles) return message;
  const partes = [
    ...Object.entries(detalles.fieldErrors || {})
      .filter(([, msgs]) => msgs?.length)
      .map(([campo, msgs]) => `${CAMPO_LABEL[campo] || campo} — ${msgs!.join(', ')}`),
    ...(detalles.formErrors || []),
  ];
  return partes.length ? `${message.replace(/[.:\s]+$/, '')}: ${partes.join('; ')}` : message;
}

/**
 * La sesión del portal dura 12 h. Si vence con la página abierta, la API
 * responde 401: se borra la sesión y se recarga, y el AuthProvider manda al
 * usuario a iniciar sesión otra vez (en vez de llenar la pantalla de errores).
 */
let recargando = false;
function sesionVencida(status: number): void {
  if (status !== 401 || recargando || import.meta.env.VITE_AUTH_DISABLED === 'true') return;
  recargando = true;
  clearSession();
  window.location.reload();
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const vista = getVista();
  if (vista) headers.set('X-Vista-Rol', vista);
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);
  if (!(init.body instanceof FormData) && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : undefined;

  if (!res.ok) {
    sesionVencida(res.status);
    const p = payload as { message?: string; detalles?: DetallesValidacion } | undefined;
    throw new ApiError(res.status, mensajeConDetalles(p?.message || res.statusText, p?.detalles), payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  putForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'PUT', body: form }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Descarga autenticada de un archivo de la API (Excel, PDF, fotos). */
export async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) {
    sesionVencida(res.status);
    throw new ApiError(res.status, 'No se pudo descargar el archivo.', undefined);
  }
  return res.blob();
}

/** Dispara la descarga de un Blob en el navegador con el nombre indicado. */
export function guardarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Las rutas de evidencia exigen Bearer token igual que el resto de la API,
 * así que no se pueden cargar con un <img src="..."> plano (el navegador no
 * adjunta el Authorization header). Se descarga como blob autenticado y se
 * expone una object URL para usar como src.
 */
export async function fetchEvidenciaBlobUrl(path: string): Promise<string> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() });
  if (!res.ok) {
    sesionVencida(res.status);
    throw new ApiError(res.status, 'No se pudo cargar la evidencia.', undefined);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
