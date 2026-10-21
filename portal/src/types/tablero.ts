import type { Kpis } from './productoDanado';
import type { KpisReclamos, TipoReclamo } from './reclamo';

export type PeriodoTablero = 7 | 30 | 90 | 365;
export type Granularidad = 'dia' | 'semana' | 'mes';

export interface RangoAntiguedad {
  id: 'r0' | 'r1' | 'r2' | 'r3';
  etiqueta: string;
  n: number;
}

/** Lo que espera en una etapa (ver resumirCola en src/domain/tablero.js). */
export interface Cola<T> {
  total: number;
  rangos: RangoAntiguedad[];
  promedioDias: number | null;
  maxDias: number | null;
  masAntiguos: (T & { entrada: string; dias: number })[];
}

export interface PuntoSerie {
  desde: string;
  entradas: number;
  salidas: number;
}

export interface Tramo {
  n: number;
  promedioDias: number | null;
}

export interface FilaDesglose {
  etiqueta: string;
  n: number;
  unidades?: number;
  monto?: number;
  otros?: boolean;
}

export interface ItemColaReporte {
  id: string;
  producto: string;
  tienda: string;
  cantidad: number;
}

export interface ItemColaReclamo {
  id: string;
  token: string;
  proveedor: string | null;
  sucursal: string | null;
  tipo: TipoReclamo;
  productosPendientes: number;
}

export interface ItemColaDocumento {
  id: number;
  numero: string | null;
  reclamoId: string;
  proveedor: string | null;
  total: number;
}

export type EtapaAbierta = 'Pendiente' | 'Devuelto' | 'Rechazado' | 'NFValidacion' | 'Aprobado' | 'EnContabilidad';

export interface TableroProductos {
  kpis: Kpis;
  colas: Record<EtapaAbierta, Cola<ItemColaReporte>>;
  serie: PuntoSerie[];
  tramos: Record<'envioProveedor' | 'respuesta' | 'documento1700' | 'validarNf' | 'enviarContabilidad' | 'pago' | 'total', Tramo>;
  resoluciones: { nf: number; devolucion: number };
  desglose: { porTienda: FilaDesglose[]; porMotivo: FilaDesglose[]; porDivision: FilaDesglose[] };
  miTrabajo: { acciones: Record<string, number>; creados: number; unidades: number; misPorEstado: Record<string, number> };
}

export interface TableroReclamos {
  kpis: KpisReclamos;
  /** devueltos: los que creó el usuario (le toca corregir); devueltosTodos: todos (esperando corrección). */
  colas: { porDecidir: Cola<ItemColaReclamo>; porEnviar: Cola<ItemColaReclamo>; devueltos: Cola<ItemColaReclamo>; devueltosTodos: Cola<ItemColaReclamo> };
  serie: PuntoSerie[];
  tramos: { decision: Tramo; envioContabilidad: Tramo };
  desglose: { porTipo: FilaDesglose[]; porOrigen: FilaDesglose[]; porProveedor: FilaDesglose[]; productos: FilaDesglose[] };
  miTrabajo: {
    creados: number;
    cerrados: number;
    enviados: number;
    productosAprobados: number;
    productosRechazados: number;
    misAbiertos: number;
  };
}

export interface TableroContabilidad {
  cola: Cola<ItemColaDocumento>;
  montoPendiente: number;
  recibidos: number;
  montoRecibido: number;
  serie: PuntoSerie[];
  porProveedor: FilaDesglose[];
}

export interface Tablero {
  periodo: { dias: PeriodoTablero; desde: string; granularidad: Granularidad; generado: string };
  productos: TableroProductos | null;
  reclamos: TableroReclamos | null;
  contabilidad: TableroContabilidad | null;
}
