/** Bandeja de Contabilidad: un registro por documento (PDF) enviado desde un reclamo. */
export type EstadoDocumentoContabilidad = 'pendiente';
export type EstadoValidacion = 'ok' | 'diferencias' | 'sin_leer';
export type DecisionLinea = 'aprobado' | 'rechazado' | null;

export interface ValidacionDocumento {
  estado: EstadoValidacion;
  coinciden: number;
  noEnReclamo: number;
  cantidadDistinta: number;
  aprobados: number;
  rechazados: number;
  sinDecision: number;
  mezclaDecisiones: boolean;
}

export interface DocumentoContabilidad {
  DocumentoId: number;
  ReclamoToken: string;
  ReclamoNumero: string;
  Proveedor: string | null;
  NumeroEmbarqueFactura: string | null;
  Compradora: string | null;
  NumeroDocumento: string | null;
  TipoDocumento: string | null;
  Movimiento: string | null;
  /** 'YYYY-MM-DD' */
  FechaDocumento: string | null;
  Total: number | null;
  Productos: number;
  AdjuntoNombre: string;
  /** Índice del adjunto en el reclamo; null si el PDF ya no existe. */
  AdjuntoIdx: number | null;
  Validacion: ValidacionDocumento;
  Estado: EstadoDocumentoContabilidad;
  EnviadoAt: string;
  EnviadoPor: string | null;
  EnviadoPorNombre: string | null;
}

export type ResultadoLinea = 'ok' | 'no_en_reclamo' | 'cantidad_distinta';

export interface LineaDocumento {
  material: string;
  descripcion: string;
  cantidadPdf: number;
  valor: number | null;
  lineaId: string | null;
  posicion: number | null;
  codigoBarra: string | null;
  tipo: string | null;
  decision: DecisionLinea;
  cantidadReclamo: number | null;
  resultado: ResultadoLinea;
}

export interface LineaReclamoSinDocumento {
  lineaId: string;
  posicion: number;
  codigoBarra: string;
  descripcion: string;
  cantidad: number;
  tipo: string;
  decision: DecisionLinea;
}

export interface DocumentoContabilidadDetalle extends DocumentoContabilidad {
  Lineas: LineaDocumento[];
  ReclamoSinDocumento: LineaReclamoSinDocumento[];
  ReclamoStatus: string;
  DecisionComentario: string | null;
}

export type FiltroEstadoContabilidad = 'pendiente' | 'todos';
