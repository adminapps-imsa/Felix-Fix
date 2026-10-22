export type TipoReclamo =
  | 'faltante_real'
  | 'sobrante_real'
  | 'diferencias'
  | 'danos_textil'
  | 'danos_perfumeria_cliente'
  | 'danos_perfumeria_gof'
  | 'devolucion';

export type OrigenReclamo = 'tienda' | 'cedi';
export type StatusReclamo = 'pendiente' | 'resuelto' | 'rechazado' | 'notificado' | 'devuelto';

/** Devolución de la compradora o respuesta de quien lo creó al reenviarlo. */
export interface ComentarioReclamo {
  ComentarioId: number;
  Tipo: 'devuelto' | 'reenviado';
  Texto: string | null;
  Usuario: string;
  UsuarioNombre: string;
  Fecha: string;
}
export type DecStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface ImagenExcel {
  filename: string;
  sheet: number;
  sheetName?: string;
  /** 'principal' = Excel de la plantilla; si no, el filename del adjunto extra. */
  origen: string;
}

export interface AdjuntoExtra {
  filename: string;
  originalname: string;
  tipo: 'excel' | 'pdf' | 'imagen';
  /** Nota de débito validada: todos sus productos estaban aprobados por la compradora. */
  notaAprobada?: boolean;
  documentoSap?: string | null;
  uploaded_at: string;
  uploaded_by: string;
  /** Nombre completo en Keycloak (o el username si no se encontró). */
  uploaded_by_nombre?: string;
}

export interface Reclamo {
  ReclamoId: number;
  Numero: string;
  Token: string;
  Tipo: TipoReclamo;
  Origen: OrigenReclamo;
  Sucursal: string | null;
  NumeroEmbarqueFactura: string | null;
  FechaRegistro: string | null;
  FechaLlegadaMercancia: string | null;
  Mundo: string | null;
  Departamento: string | null;
  Marca: string | null;
  Proveedor: string | null;
  Compradora: string | null;
  Division: string | null;
  Motivo: string | null;
  SapDoc1: string | null;
  SapDoc2: string | null;
  SapDoc3: string | null;
  SapDocsExtra: string[];
  SapDocs: string[];
  ArchivoExcelNombre: string | null;
  TieneExcel: boolean;
  ImagenesExcel: ImagenExcel[];
  AdjuntosExtra: AdjuntoExtra[];
  Status: StatusReclamo;
  /** Productos con motivo «devolución» (para saber si lleva el retiro del proveedor). */
  LineasDevolucion?: number;
  /** Retiro del proveedor (reclamos de devolución): día, quién lo registró y cuándo. */
  RetiroProveedorFecha?: string | null;
  RetiroProveedorFoto?: string | null;
  RetiroProveedorPor?: string | null;
  RetiroProveedorPorNombre?: string | null;
  RetiroProveedorRegistradoAt?: string | null;
  /** Historial de devoluciones y reenvíos (viene en el detalle). */
  Comentarios?: ComentarioReclamo[];
  Comentario: string | null;
  CreatedAt: string;
  CreatedBy: string;
  /** Nombre completo en Keycloak (o el username si no se encontró). */
  CreatedByNombre?: string;
  DecisionAt: string | null;
  DecisionBy: string | null;
  DecisionByNombre?: string | null;
  /** Último envío a contabilidad (solo reclamos resueltos o rechazados). */
  EnviadoContabilidadAt: string | null;
  EnviadoContabilidadBy: string | null;
  EnviadoContabilidadByNombre?: string | null;
  EnviadoContabilidadA: string | null;
  LineasTotal: number;
  LineasPendientes: number;
  /** La compradora aprobó productos: para enviar a contabilidad hace falta su nota de débito. */
  RequiereNotaAprobada: boolean;
  TieneNotaAprobada: boolean;
}

export interface ReclamoLinea {
  LineaId: number;
  Posicion: number;
  CodigoBarra: string;
  Cantidad: number | null;
  Tipo: TipoReclamo;
  Descripcion: string | null;
  PrecioVenta: number | null;
  /** null = no se pudo validar contra SAP (no disponible). */
  Encontrado: boolean | null;
  AutoAprobado: boolean;
  DecStatus: DecStatus;
  DecComentario: string | null;
  DecAt: string | null;
  DecBy: string | null;
  DecByNombre?: string | null;
}

export interface KpisReclamos {
  total: number;
  pendientes: number;
  notificados: number;
  resueltos: number;
  rechazados: number;
  productosPorDecidir: number;
  /** Cerrados por la compradora que todavía no se envían a contabilidad. */
  porEnviarContabilidad: number;
  /** Devueltos por la compradora a quien los creó. */
  devueltos: number;
  /** De esos, los que creó el usuario (le toca corregirlos). */
  misDevueltos: number;
}

export interface PreviewExcel {
  origen: OrigenReclamo;
  hoja: string;
  sucursal: string | null;
  /** Encabezado DIVISIÓN de la plantilla CEDI. */
  division: string | null;
  /** Columna/encabezado FECHA del Excel: la llegada de la mercancía. */
  fechaLlegadaMercancia: string | null;
  numeroEmbarqueFactura: string | null;
  /** Columna DOCUMENTO del Excel, sin repetidos. */
  documentosSap: string[];
  /** Columna COMENTARIOS del Excel unida en un solo texto. */
  comentario: string | null;
  proveedor: string | null;
  /** Compradora a cargo del proveedor según FelixApproval; null si no hay una sola. */
  compradora: string | null;
  mundo: string | null;
  departamento: string | null;
  marca: string | null;
  tipoSugerido: TipoReclamo | null;
  desglose: Partial<Record<TipoReclamo, number>>;
  lineasTotal: number;
  lineasSinMotivo: number;
  validacionCodigos: { disponible: boolean; encontrados: number | null; noEncontrados: string[] };
  /** Cada producto con las columnas de la plantilla: es lo que llena el formulario. */
  filas: FilaProducto[];
}

/** Un producto con las columnas de la plantilla (FECHA … MOTIVO). */
export interface FilaProducto {
  posicion: number;
  fecha: string | null;
  producto: string | null;
  codigoBarra: string;
  descripcion: string | null;
  esperada: number | null;
  recibida: number | null;
  diferencia: number | null;
  averiadas: number | null;
  documento: string | null;
  motivo: string | null;
}

/** Opciones de los dropdowns del formulario (GET /reclamos/catalogos). */
export interface CatalogosReclamo {
  proveedores: string[];
  mundos: string[];
  departamentos: string[];
  marcas: string[];
  compradoras: string[];
  divisiones: string[];
  motivos: string[];
  /** false si el catálogo de FelixApproval no respondió: los campos quedan como texto libre. */
  disponible: boolean;
}

/** Lo que el catálogo conoce de un proveedor (GET /reclamos/proveedor). */
/** Un documento SAP que ya está en otro(s) reclamo(s). */
export interface DocumentoSapUsado {
  documento: string;
  reclamos: { numero: string; token: string; status: StatusReclamo }[];
}

export interface RelacionProveedor {
  proveedor: string;
  mundos: string[];
  departamentos: string[];
  marcas: string[];
  compradoras: string[];
}

export interface PermisosReclamos {
  puedeCrear: boolean;
  puedeDecidir: boolean;
  puedeEliminar: boolean;
  /** Adjuntar en cualquier reclamo (decidir o "Adjuntar en cualquier reclamo"); el creador siempre puede en los suyos. */
  puedeAdjuntar: boolean;
  /** "Adjuntar en cualquier reclamo" (Torre de Control): agrega adjuntos aunque ya haya decisión. */
  puedeAdjuntarCerrado: boolean;
  /** Enviar a contabilidad los reclamos cerrados (decidir o "Enviar reclamos a contabilidad"). */
  puedeEnviarContabilidad: boolean;
  /** Devolver a quien lo creó, con comentario (quien decide). */
  puedeDevolver: boolean;
  /** Corregir y reenviar cualquier reclamo devuelto (super administrador); los demás, solo los que crearon. */
  puedeCorregirCualquiera: boolean;
  /** Super administrador: elimina el reclamo en cualquier estado. */
  puedeEliminarCualquiera: boolean;
  /** Reclamos de devolución: marcar que el proveedor retiró el producto (Gof). */
  puedeRegistrarRetiro: boolean;
  /** Igual a puedeDecidir (compatibilidad). */
  esAdmin: boolean;
  username: string;
}
