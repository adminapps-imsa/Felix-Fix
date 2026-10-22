// Catálogo de los correos que manda el portal, para verlos en Configuración →
// Correos: cada uno con cuándo sale, quién lo recibe y su vista previa armada
// con datos de EJEMPLO (no se lee ni se toca ningún caso real).
import { EVENTOS as EVENTOS_PD, plantillaAviso } from './avisosProductosDanados.js';
import { plantillaAvisoReclamo } from './avisosReclamos.js';
import { plantillaReporteProveedor } from './plantillaReporteProveedor.js';
import { plantillaReclamoContabilidad } from './plantillaReclamoContabilidad.js';
import { plantillaBienvenida } from './plantillaBienvenida.js';

const AHORA = () => new Date();

const reporte = () => ({
  ReporteId: 53,
  Estado: 'Rechazado',
  TiendaNombre: 'Vía España',
  NombreProducto: 'Crema hidratante 50 ml',
  CodigoBarras: '7701234567890',
  Marca: 'Marca de ejemplo',
  Division: 'Cosméticos',
  Motivo: 'Daño',
  Cantidad: 2,
  EmpleadoReportaNombre: 'Ana Pérez',
  FechaCreacion: AHORA(),
  Descripcion: 'La caja llegó abierta y el envase golpeado.',
});

const reclamo = (extra = {}) => ({
  Numero: 'REC-000024',
  Token: '00000000-0000-0000-0000-000000000000',
  Tipo: 'sobrante_real',
  Status: 'pendiente',
  Proveedor: 'PROVEEDOR DE EJEMPLO S.A.',
  Origen: 'tienda',
  Sucursal: 'Town Center',
  SapDocs: ['4900099001'],
  LineasTotal: 3,
  LineasAprobadas: 0,
  LineasPendientes: 3,
  NumeroEmbarqueFactura: 'FAC-0001',
  CreatedBy: 'gof.ejemplo',
  CreatedByNombre: 'Gof de ejemplo',
  Comentario: 'Sobrante en el embarque de la semana.',
  CreatedAt: AHORA(),
  Marca: 'Marca de ejemplo',
  Mundo: 'Belleza',
  Departamento: 'Perfumería',
  Compradora: 'COMPRADORA DE EJEMPLO',
  FechaRegistro: '2026-10-20',
  FechaLlegadaMercancia: '2026-10-18',
  ...extra,
});

const lineas = [
  { Posicion: 1, CodigoBarra: '7701234500011', DescripcionExcel: 'Perfume 100 ml', Cantidad: 2, Tipo: 'sobrante_real', DecStatus: 'aprobado' },
  { Posicion: 2, CodigoBarra: '7701234500028', DescripcionExcel: 'Crema 50 ml', Cantidad: 1, Tipo: 'sobrante_real', DecStatus: 'aprobado' },
  { Posicion: 3, CodigoBarra: '7701234500035', DescripcionExcel: 'Labial rojo', Cantidad: 3, Tipo: 'sobrante_real', DecStatus: 'rechazado', DecComentario: 'No vino en el embarque' },
];

// Foto de ejemplo para el correo al proveedor (en el real va incrustada).
const FOTO =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='536' height='240'><rect width='100%' height='100%' fill='%23e2e8f0'/><text x='50%' y='50%' text-anchor='middle' font-family='Arial' font-size='18' fill='%2364748b'>Foto de evidencia</text></svg>";

// Detalle de ejemplo de cada evento de Productos Dañados que lleva un dato extra.
const DETALLE_PD = {
  nf: 'El proveedor indica que el daño es del transporte.',
  contabilidad: 'nota-credito.pdf',
  nfCerrado: 'Documento salida de NF: 4904442290',
  pagado: 'Referencia: TRF-0091',
};

// Quién recibe cada aviso de Productos Dañados (en palabras), según el permiso del área.
const AREA_PD = {
  'productos_danados.enviar': 'Compradoras (permiso «Enviar al proveedor»)',
  'productos_danados.documentar': 'Gof (permiso «Documento para contabilidad»)',
  'productos_danados.nf_documento': 'Gof (permiso «Documento 1700 de los NF»)',
  'productos_danados.nf': 'Supervisor GOF (permiso «Validar NF»)',
  'productos_danados.pago': 'Contabilidad (permiso «Confirmar pago del proveedor»)',
};

const CUANDO_PD = {
  nuevo: 'Se crea un reporte de producto dañado.',
  aprobado: 'La compradora registra que el proveedor aprobó la devolución.',
  nf: 'La compradora registra que el proveedor no aprobó (NF).',
  nfValidar: 'Gof marca el check «Documento 1700».',
  contabilidad: 'Gof envía la devolución aprobada a contabilidad.',
  nfCerrado: 'El supervisor GOF valida y cierra el NF.',
  pagado: 'Contabilidad registra el pago del proveedor.',
};

function correosProductosDanados() {
  const lista = [];
  for (const [ev, def] of Object.entries(EVENTOS_PD)) {
    const detalle = def.detalle ? DETALLE_PD[ev] : null;
    if (def.area) {
      lista.push({
        id: `pd-${ev}-area`,
        grupo: 'Productos Dañados',
        nombre: def.area.titulo,
        cuando: CUANDO_PD[ev],
        quien: AREA_PD[def.area.permiso] || def.area.permiso,
        generar: () => plantillaAviso(def.area, reporte(), { detalle, etiquetaDetalle: def.detalle }),
      });
    }
    if (def.creador) {
      lista.push({
        id: `pd-${ev}-creador`,
        grupo: 'Productos Dañados',
        nombre: def.creador.titulo,
        cuando: CUANDO_PD[ev],
        quien: 'Quien creó el reporte',
        generar: () =>
          plantillaAviso(def.creador, reporte(), { detalle, etiquetaDetalle: def.detalle, pie: 'Lo recibes porque creaste este reporte.', nombre: 'Ana Pérez' }),
      });
    }
  }
  lista.push({
    id: 'pd-proveedor',
    grupo: 'Productos Dañados',
    nombre: 'Reporte al proveedor',
    cuando: 'La compradora pulsa «Enviar al proveedor».',
    quien: 'El proveedor (correo externo), con la foto y los adjuntos',
    generar: () => plantillaReporteProveedor(reporte(), { remitente: { nombre: 'Compradora de ejemplo', correo: 'compradora@ejemplo.com' }, conFoto: true, adjuntos: ['factura.pdf'], srcFoto: FOTO }),
  });
  return lista;
}

const CORREOS_RECLAMOS = [
  {
    id: 'rec-nuevo',
    nombre: 'Nuevo reclamo por revisar',
    cuando: 'Se crea un reclamo que espera la decisión de la compradora.',
    quien: 'Compradoras (permiso «Aprobar o rechazar»)',
    generar: () => plantillaAvisoReclamo('nuevo', reclamo(), { comentario: 'Sobrante en el embarque de la semana.', de: 'Gof de ejemplo', para: 'area' }),
  },
  {
    id: 'rec-devuelto',
    nombre: 'Reclamo devuelto para corregir',
    cuando: 'La compradora pulsa «Devolver» con un comentario.',
    quien: 'Quien creó el reclamo',
    generar: () =>
      plantillaAvisoReclamo('devuelto', reclamo({ Status: 'devuelto' }), { comentario: 'La marca está mal, corrígela por favor.', de: 'Compradora de ejemplo', nombre: 'Gof de ejemplo', para: 'persona' }),
  },
  {
    id: 'rec-reenviado',
    nombre: 'Reclamo corregido y reenviado',
    cuando: 'Quien lo creó lo corrige y pulsa «Reenviar a la compradora».',
    quien: 'La compradora que lo devolvió',
    generar: () =>
      plantillaAvisoReclamo('reenviado', reclamo(), { comentario: 'Listo, corregí la marca.', de: 'Gof de ejemplo', nombre: 'Compradora de ejemplo', para: 'persona' }),
  },
  {
    id: 'rec-cerrado-area',
    nombre: 'Reclamo listo para contabilidad',
    cuando: 'La compradora confirma o rechaza el reclamo.',
    quien: 'Gof y Torre de Control (permiso «Enviar reclamos a contabilidad»)',
    generar: () =>
      plantillaAvisoReclamo('cerrado', reclamo({ Status: 'resuelto', LineasAprobadas: 2, LineasPendientes: 0 }), { comentario: 'Todo bien con la factura.', de: 'Compradora de ejemplo', para: 'area' }),
  },
  {
    id: 'rec-contabilidad',
    nombre: 'Reclamo para contabilidad',
    cuando: 'Gof o Torre de Control pulsan «Enviar a contabilidad».',
    quien: 'Contabilidad (permiso «Recibir reclamos en contabilidad»), con los productos y todos los archivos',
    generar: () =>
      plantillaReclamoContabilidad(
        reclamo({ Status: 'resuelto', LineasAprobadas: 2, LineasPendientes: 0, DecisionBy: 'compradora', DecisionByNombre: 'Compradora de ejemplo', DecisionAt: AHORA(), Comentario: 'Todo bien con la factura.' }),
        lineas,
        {
          remitente: { nombre: 'Gof de ejemplo', correo: 'gof@ejemplo.com' },
          archivos: [{ filename: 'Reclamo REC-000024 - Excel.xlsx' }, { filename: 'Reclamo REC-000024 - 4900099001.pdf', descripcion: 'documento SAP' }],
          documentos: [{ adjuntoNombre: '4900099001.pdf', numeroDocumento: '4900099001', movimiento: '912 Anul DEV', total: 5516.22, lineas: [1, 2], legible: true, validacion: { estado: 'ok' } }],
        }
      ),
  },
].map((c) => ({ ...c, grupo: 'Reclamos' }));

const BIENVENIDA = {
  id: 'bienvenida',
  grupo: 'Portal',
  nombre: 'Bienvenida al portal',
  cuando: 'El administrador la envía desde aquí a las personas que elija.',
  quien: 'Las personas elegidas (cada una ve lo que puede hacer según sus roles)',
  generar: () =>
    plantillaBienvenida({
      nombre: 'Ana Pérez',
      username: 'aperez',
      roles: ['Compradora'],
      permisos: new Set(['productos_danados.ver', 'productos_danados.enviar', 'productos_danados.aprobar', 'reclamos.ver', 'reclamos.decidir']),
    }),
};

/** Todos los correos, en el orden en que se muestran. */
export const CORREOS = () => [BIENVENIDA, ...correosProductosDanados(), ...CORREOS_RECLAMOS];
