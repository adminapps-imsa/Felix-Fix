/** Texto del catálogo de motivos (crece cuando alguien escribe uno nuevo). */
export type Motivo = string;
/**
 * Flujo: Pendiente → NF (Rechazado, con Gof: documento 1700) → NF por validar
 * (NFValidacion, con supervisor GOF) → Cerrado, o
 * Pendiente → Devolución aprobada (Aprobado, con Gof) → EnContabilidad → Cerrado.
 * EnProceso/Procesado son de la baja en SAP (todavía sin integrar).
 */
export type Estado = 'Pendiente' | 'Aprobado' | 'Rechazado' | 'NFValidacion' | 'EnContabilidad' | 'Cerrado' | 'EnProceso' | 'Procesado';

// Códigos de antes de que el motivo fuera un catálogo (la migración 008 ya
// los reescribió; se conserva por si llega alguno sin migrar).
const MOTIVO_LEGADO: Record<string, string> = { Dano: 'Daño', CambioDevolucion: 'Cambio / Devolución' };
export const motivoLabel = (m: string) => MOTIVO_LEGADO[m] || m;

export const ESTADO_LABEL: Record<Estado, string> = {
  Pendiente: 'Pendiente',
  Aprobado: 'Devolución aprobada',
  Rechazado: 'NF',
  NFValidacion: 'NF por validar',
  EnContabilidad: 'En contabilidad',
  Cerrado: 'Cerrado',
  EnProceso: 'Procesando…',
  Procesado: 'Procesado',
};

export interface ReporteProductoDanado {
  ReporteId: number;
  TiendaId: number;
  TiendaCodigo: string;
  TiendaNombre: string;
  EmpleadoReportaNombre: string;
  EmpleadoReportaUsuario: string;
  /** Ya no se pide; solo reportes viejos lo tienen. */
  Sku: string | null;
  CodigoBarras: string | null;
  NombreProducto: string;
  Marca: string | null;
  /** Ya no se pide; solo reportes viejos la tienen. */
  Categoria: string | null;
  Division: string | null;
  Motivo: Motivo;
  Cantidad: number;
  Descripcion: string | null;
  CorreosProveedor: string[];
  Adjuntos: AdjuntoReporte[];
  /** Último envío del reporte al proveedor por correo. */
  EnviadoProveedorAt: string | null;
  EnviadoProveedorPor: string | null;
  EnviadoProveedorPorNombre?: string | null;
  EnviosProveedor: number;
  EvidenciaProveedor: string;
  EvidenciaKey: string | null;
  Estado: Estado;
  /** Cómo terminó la respuesta del proveedor. */
  Resolucion: 'Devolucion' | 'NF' | null;
  /** Referencia del pago del proveedor que registró contabilidad. */
  PagoReferencia: string | null;
  MotivoRechazo: string | null;
  ProcesadoIntentos: number;
  SapDocumentoId: string | null;
  /** Número del documento 1700 que registró Gof en un NF. */
  Documento1700: string | null;
  FechaCreacion: string;
  FechaActualizacion: string;
}

export interface AdjuntoReporte {
  filename: string;
  originalname: string;
  tipo: 'pdf' | 'excel';
  uploaded_at: string;
  uploaded_by: string;
  uploaded_by_nombre?: string;
  /** 'gof' = documento para contabilidad (no va al proveedor). */
  etapa?: 'gof';
}

export interface VistaPreviaCorreo {
  asunto: string;
  html: string;
  para: string[];
  cc: string[];
  responderA: string | null;
  adjuntos: string[];
  conFoto: boolean;
  /** false = el servidor todavía no tiene buzón para enviar. */
  configurado: boolean;
  avisos: string[];
}

export interface CatalogosReporte {
  divisiones: string[];
  motivos: string[];
}

export interface HistorialItem {
  HistorialId: number;
  Accion: string;
  EstadoAnterior: string | null;
  EstadoNuevo: string | null;
  UsuarioId: string;
  UsuarioNombre: string | null;
  Detalle: string | null;
  FechaEvento: string;
}

export interface ReporteDetalle extends ReporteProductoDanado {
  historial: HistorialItem[];
}

export interface Tienda {
  TiendaId: number;
  Codigo: string;
  Nombre: string;
  Direccion?: string | null;
}

export interface Kpis {
  pendientes: number;
  aprobados: number;
  rechazados: number;
  nfValidacion: number;
  procesados: number;
  enContabilidad: number;
  cerrados: number;
  unidadesDadasBaja: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Filtros {
  tienda?: string;
  motivo?: Motivo | '';
  estado?: Estado | '';
  fechaDesde?: string;
  fechaHasta?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}
