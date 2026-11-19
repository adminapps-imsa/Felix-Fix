/** Bandeja de Contabilidad: un registro por documento (PDF) enviado desde un reclamo. */
export type EstadoDocumentoContabilidad = 'pendiente' | 'aprobado' | 'no_aprobado' | 'no_reclamado';
/** Contabilidad decide si se le reclama al proveedor. */
export type DecisionContabilidad = 'reclamar' | 'no_reclamar';
/** Respuesta del proveedor a la nota de débito. */
export type RespuestaProveedor = 'aprobado' | 'no_aprobado';
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
  /** Aprobado solo por su tipo (el sistema), no por la compradora. */
  automatica?: boolean;
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
  automatica?: boolean;
}

export interface DocumentoContabilidadDetalle extends DocumentoContabilidad {
  Lineas: LineaDocumento[];
  ReclamoSinDocumento: LineaReclamoSinDocumento[];
  ReclamoStatus: string;
  DecisionComentario: string | null;
  /** 'sistema': el reclamo se cerró solo (aprobación automática). */
  ReclamoDecisionBy: string | null;
  /** Correos del proveedor usados antes en este reclamo. */
  CorreosProveedor: string[];
  /** Último envío de este documento al proveedor. */
  EnvioProveedor: { at: string | null; por: string | null; porNombre: string | null; para: string | null; comentario: string | null; veces: number } | null;
  /** Reclamar o no al proveedor (null mientras contabilidad no decide). */
  Decision: { decision: DecisionContabilidad; at: string | null; por: string | null; porNombre: string | null; comentario: string | null } | null;
  /** Respuesta del proveedor registrada por contabilidad (null mientras está pendiente). */
  Respuesta: {
    estado: RespuestaProveedor;
    at: string | null;
    por: string | null;
    porNombre: string | null;
    registroSap: string | null;
    archivoNombre: string | null;
    tieneArchivo: boolean;
  } | null;
}

export interface VistaPreviaCorreoProveedor {
  asunto: string;
  html: string;
  para: string[];
  cc: string[];
  responderA: string | null;
  adjuntos: string[];
  /** false = el servidor todavía no tiene buzón para enviar. */
  configurado: boolean;
  avisos: string[];
}

export type FiltroEstadoContabilidad = 'pendiente' | 'aprobado' | 'no_aprobado' | 'no_reclamado' | 'todos';
