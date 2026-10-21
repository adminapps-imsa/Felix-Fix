// Tablero: cómo va el trabajo de quien entra, armado con sus permisos. Cada
// módulo sale solo si el usuario lo trabaja; Productos Dañados respeta lo que
// puede ver (Gof: solo NF y devoluciones), igual que la lista.
import * as repo from '../repositories/tableroRepository.js';
import { obtenerKpis as kpisProductos } from '../repositories/productosDanadosRepository.js';
import { obtenerKpis as kpisReclamos } from '../repositories/reclamosRepository.js';
import { tienePermiso } from './acceso/permisos.js';
import { alcanceVista } from '../domain/productoDanado.js';
import { periodoValido, granularidad, inicioPeriodo, serie, resumirCola, promedioTramo, topConOtros } from '../domain/tablero.js';

const algunPermiso = (usuario, permisos) => permisos.some((p) => tienePermiso(usuario, p));

// Igual que las rutas: quién trabaja cada módulo.
const PERMISOS_PRODUCTOS = [
  'productos_danados.ver', 'productos_danados.crear', 'productos_danados.enviar', 'productos_danados.aprobar',
  'productos_danados.procesar', 'productos_danados.eliminar', 'productos_danados.nf', 'productos_danados.ver_nf',
  'productos_danados.nf_documento', 'productos_danados.documentar', 'productos_danados.pago',
];
const PERMISOS_RECLAMOS = ['reclamos.ver', 'reclamos.crear', 'reclamos.adjuntar', 'reclamos.decidir', 'reclamos.eliminar', 'reclamos.enviar_contabilidad'];

/** Etapas abiertas de un reporte, en el orden del flujo. */
const ETAPAS_PD = ['Pendiente', 'Devuelto', 'Rechazado', 'NFValidacion', 'Aprobado', 'EnContabilidad'];

export async function obtenerTablero(query, usuario) {
  const dias = periodoValido(query.dias);
  const ahora = new Date();
  const desde = inicioPeriodo(dias, ahora);
  const gran = granularidad(dias);
  const ctx = { desde, ahora, gran };

  const [productos, reclamos, contabilidad] = await Promise.all([
    algunPermiso(usuario, PERMISOS_PRODUCTOS) ? tableroProductos(usuario, ctx) : null,
    algunPermiso(usuario, PERMISOS_RECLAMOS) ? tableroReclamos(usuario, ctx) : null,
    tienePermiso(usuario, 'reclamos.contabilidad') ? tableroContabilidad(ctx) : null,
  ]);

  return { periodo: { dias, desde, granularidad: gran, generado: ahora }, productos, reclamos, contabilidad };
}

async function tableroProductos(usuario, { desde, ahora, gran }) {
  const resoluciones = alcanceVista(usuario.permisos || new Set());
  const [kpis, abiertos, hitos, desglose, miTrabajo] = await Promise.all([
    kpisProductos({ resoluciones }),
    repo.pdAbiertos(resoluciones),
    repo.pdHitos(resoluciones, desde),
    repo.pdDesglose(resoluciones, desde),
    repo.pdMiTrabajo(usuario, desde),
  ]);

  const colas = Object.fromEntries(
    ETAPAS_PD.map((estado) => [
      estado,
      resumirCola(
        abiertos
          .filter((r) => r.Estado === estado)
          .map((r) => ({
            entrada: r.Entrada,
            id: r.ReporteId,
            producto: r.NombreProducto,
            tienda: r.TiendaCodigo,
            cantidad: Number(r.Cantidad) || 0,
          })),
        { ahora }
      ),
    ])
  );

  const tramo = (inicio, fin, filtro = () => true) => promedioTramo(hitos.filter(filtro).map((h) => ({ inicio: h[inicio], fin: h[fin] })), desde);
  const esNf = (h) => h.Resolucion === 'NF';
  const esDevolucion = (h) => h.Resolucion === 'Devolucion';
  const respuestas = hitos.filter((h) => h.Respuesta && new Date(h.Respuesta) >= desde);

  return {
    kpis,
    colas,
    serie: serie({ entradas: hitos.map((h) => h.Creado), salidas: hitos.map((h) => h.Cerrado), desde, ahora, gran }),
    tramos: {
      envioProveedor: tramo('Creado', 'EnviadoProveedor'),
      respuesta: tramo('Creado', 'Respuesta'),
      documento1700: tramo('Respuesta', 'Documento1700', esNf),
      validarNf: tramo('Documento1700', 'NfCerrado', esNf),
      enviarContabilidad: tramo('Respuesta', 'EnviadoContabilidad', esDevolucion),
      pago: tramo('EnviadoContabilidad', 'PagoRecibido', esDevolucion),
      total: tramo('Creado', 'Cerrado'),
    },
    resoluciones: {
      nf: respuestas.filter(esNf).length,
      devolucion: respuestas.filter(esDevolucion).length,
    },
    desglose: {
      porTienda: topConOtros(desglose.porTienda),
      porMotivo: topConOtros(desglose.porMotivo),
      porDivision: topConOtros(desglose.porDivision),
    },
    miTrabajo,
  };
}

async function tableroReclamos(usuario, { desde, ahora, gran }) {
  const [kpis, abiertos, hitos, desglose, miTrabajo] = await Promise.all([
    kpisReclamos(usuario.username),
    repo.recAbiertos(),
    repo.recHitos(desde),
    repo.recDesglose(desde),
    repo.recMiTrabajo(usuario, desde),
  ]);

  const cola = (nombre, filtro = () => true) =>
    resumirCola(
      abiertos
        .filter((r) => r.Cola === nombre && filtro(r))
        .map((r) => ({
          entrada: r.Entrada,
          id: r.ReclamoId,
          token: r.Token,
          proveedor: r.Proveedor,
          sucursal: r.Sucursal,
          tipo: r.Tipo,
          productosPendientes: r.LineasPendientes,
        })),
      { ahora }
    );
  const tramo = (inicio, fin) => promedioTramo(hitos.map((h) => ({ inicio: h[inicio], fin: h[fin] })), desde);

  return {
    kpis,
    // Devueltos: los que creó este usuario (le toca corregirlos); `devueltosTodos`: todos (la compradora los espera).
    colas: {
      porDecidir: cola('porDecidir'),
      porEnviar: cola('porEnviar'),
      devueltos: cola('devuelto', (r) => r.CreatedBy === usuario.username),
      devueltosTodos: cola('devuelto'),
    },
    serie: serie({ entradas: hitos.map((h) => h.Creado), salidas: hitos.map((h) => h.Decision), desde, ahora, gran }),
    tramos: { decision: tramo('Creado', 'Decision'), envioContabilidad: tramo('Decision', 'EnviadoContabilidad') },
    desglose: {
      porTipo: topConOtros(desglose.porTipo),
      porOrigen: desglose.porOrigen,
      porProveedor: topConOtros(desglose.porProveedor),
      productos: desglose.productos,
    },
    miTrabajo,
  };
}

async function tableroContabilidad({ desde, ahora, gran }) {
  const [pendientes, { recibidos, porProveedor }] = await Promise.all([repo.docsPendientes(), repo.docsRecibidos(desde)]);
  const cola = resumirCola(
    pendientes.map((d) => ({ entrada: d.Entrada, id: d.DocumentoId, numero: d.NumeroDocumento, reclamoId: d.ReclamoId, proveedor: d.Proveedor, total: Number(d.Total) || 0 })),
    { ahora }
  );
  return {
    cola,
    montoPendiente: pendientes.reduce((s, d) => s + (Number(d.Total) || 0), 0),
    recibidos: recibidos.length,
    montoRecibido: recibidos.reduce((s, d) => s + d.total, 0),
    serie: serie({ entradas: recibidos.map((d) => d.fecha), salidas: [], desde, ahora, gran }),
    porProveedor: topConOtros(porProveedor),
  };
}
