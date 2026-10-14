import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, House, Plus } from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../components/ui/TituloPagina';
import { GlassCard } from '../../components/ui/GlassCard';
import { useAuth } from '../../auth/useAuth';
import { ACCESO_PRODUCTOS, ACCESO_RECLAMOS, P } from '../../auth/permisos';
import { cn } from '../../lib/cn';
import { formatCantidad } from '../../lib/formatters';
import * as apiProductos from '../../api/productosDanados';
import * as apiReclamos from '../../api/reclamos';
import * as apiContabilidad from '../../api/contabilidad';
import type { Kpis } from '../../types/productoDanado';
import type { KpisReclamos } from '../../types/reclamo';

interface Tarea {
  id: string;
  cantidad: number | null;
  titulo: string;
  detalle: string;
  to: string;
  tono: string;
}

interface Datos {
  pd: Kpis | null;
  rec: KpisReclamos | null;
  docs: number | null;
}

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

/**
 * Inicio por rol: lo que le toca hoy a quien entra, armado con sus permisos.
 * Cada tarea abre la lista ya filtrada. Debajo, cómo van los casos.
 */
export function InicioPage() {
  const { puede, user } = useAuth();
  // Contabilidad (solo "Confirmar pago") necesita los conteos, pero no tiene la pantalla de Productos Dañados.
  const pedirProductos = puede(...ACCESO_PRODUCTOS, P.pdPago);
  const verProductos = puede(...ACCESO_PRODUCTOS);
  const verReclamos = puede(...ACCESO_RECLAMOS);
  const verDocumentos = puede(P.recContabilidad);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const pedir = <T,>(activo: boolean, fn: () => Promise<T>) => (activo ? fn() : Promise.resolve(null));
    Promise.allSettled([
      pedir(pedirProductos, () => apiProductos.obtenerKpis({})),
      pedir(verReclamos, () => apiReclamos.listarReclamos({ pageSize: 1 }).then((r) => r.kpis)),
      pedir(verDocumentos, () => apiContabilidad.listarDocumentos({ estado: 'pendiente', pageSize: 1 }).then((r) => r.pagination.total)),
    ]).then(([pd, rec, docs]) => {
      if (cancelado) return;
      const valor = <T,>(r: PromiseSettledResult<T | null>) => (r.status === 'fulfilled' ? r.value : null);
      setError([pd, rec, docs].some((r) => r.status === 'rejected'));
      setDatos({ pd: valor(pd), rec: valor(rec), docs: valor(docs) });
    });
    return () => {
      cancelado = true;
    };
  }, [pedirProductos, verReclamos, verDocumentos]);

  const pd = datos?.pd;
  const rec = datos?.rec;
  const n = (v: number | undefined | null) => (datos ? (v ?? null) : null);

  const tareas: Tarea[] = [];
  if (puede(P.pdEnviar, P.pdAprobar))
    tareas.push({ id: 'pd-pend', cantidad: n(pd?.pendientes), titulo: 'Reportes por enviar al proveedor', detalle: 'Envíalos y registra la respuesta: Devolución aprobada o NF.', to: '/productos-danados?estado=Pendiente', tono: 'text-warning' });
  if (puede(P.pdNfDocumento))
    tareas.push({ id: 'pd-nf-1700', cantidad: n(pd?.rechazados), titulo: 'Reportes NF: falta el documento 1700', detalle: 'Haz el documento 1700, marca el check y pásalo al supervisor GOF.', to: '/productos-danados?estado=Rechazado', tono: 'text-danger' });
  if (puede(P.pdNf))
    tareas.push({ id: 'pd-nf', cantidad: n(pd?.nfValidacion), titulo: 'Reportes NF por validar', detalle: 'Escribe el documento salida de NF y valida el reporte para cerrarlo.', to: '/productos-danados?estado=NFValidacion', tono: 'text-danger' });
  if (puede(P.pdDocumentar))
    tareas.push({ id: 'pd-doc', cantidad: n(pd?.aprobados), titulo: 'Devoluciones aprobadas por enviar a contabilidad', detalle: 'Sube el documento (PDF o Excel) y envíalas a contabilidad.', to: '/productos-danados?estado=Aprobado', tono: 'text-brand-600 dark:text-brand-400' });
  if (puede(P.pdPago))
    tareas.push({ id: 'pd-pago', cantidad: n(pd?.enContabilidad), titulo: 'Devoluciones esperando el pago del proveedor', detalle: 'Cuando llegue el pago, marca "Pago recibido" con su referencia.', to: '/contabilidad?seccion=productos', tono: 'text-warning' });
  if (puede(P.recDecidir))
    tareas.push({
      id: 'rec-dec',
      cantidad: n(rec?.pendientes),
      titulo: 'Reclamos por decidir',
      detalle: rec?.productosPorDecidir ? `${formatCantidad(rec.productosPorDecidir)} productos esperan tu decisión.` : 'Aprueba o rechaza sus productos y cierra el reclamo.',
      to: '/reclamos?estado=pendiente',
      tono: 'text-warning',
    });
  if (puede(P.recEnviarContabilidad))
    tareas.push({ id: 'rec-env', cantidad: n(rec?.porEnviarContabilidad), titulo: 'Reclamos cerrados sin enviar a contabilidad', detalle: 'Ábrelos y pulsa "Enviar a contabilidad".', to: '/reclamos?porEnviar=1', tono: 'text-brand-600 dark:text-brand-400' });
  if (verDocumentos)
    tareas.push({ id: 'docs', cantidad: n(datos?.docs), titulo: 'Documentos de reclamos por revisar', detalle: 'Revisa si cada PDF cuadra con los productos de su reclamo.', to: '/contabilidad', tono: 'text-brand-600 dark:text-brand-400' });

  const conTrabajo = tareas.filter((t) => t.cantidad === null || t.cantidad > 0);
  const alDia = tareas.filter((t) => t.cantidad === 0);
  const pendientes = conTrabajo.reduce((s, t) => s + (t.cantidad ?? 0), 0);
  const nombre = (user?.name || user?.username || '').split(' ')[0];

  const bajada = !datos
    ? 'Revisando lo que tienes pendiente…'
    : !tareas.length
      ? 'Desde aquí creas tus casos y ves cómo avanzan.'
      : pendientes
        ? `Tienes ${formatCantidad(pendientes)} ${pendientes === 1 ? 'caso' : 'casos'} esperando por ti.`
        : 'No tienes nada pendiente. Todo al día.';

  return (
    <div className="flex flex-col gap-6">
      <BandaPagina className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TituloPagina icono={House} titulo={`${saludo()}${nombre ? `, ${nombre}` : ''}`}>
          <p className="bajada-pagina">{bajada}</p>
        </TituloPagina>
        <div className="flex flex-wrap gap-2">
          {puede(P.pdCrear) && <Atajo to="/productos-danados?nuevo=1">Nuevo reporte</Atajo>}
          {puede(P.recCrear) && <Atajo to="/reclamos?nuevo=1">Nuevo reclamo</Atajo>}
        </div>
      </BandaPagina>

      {error && <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm">No se pudo cargar todo lo pendiente. Recarga la página en un momento.</div>}

      {tareas.length > 0 && (
        <section aria-labelledby="titulo-tareas" className="flex flex-col gap-2">
          <h2 id="titulo-tareas" className="etiqueta px-1">
            Lo que te toca
          </h2>
          {conTrabajo.length > 0 ? (
            <GlassCard className="divide-y divide-black/5 !p-0 dark:divide-white/5">
              {conTrabajo.map((t) => (
                <Link
                  key={t.id}
                  to={t.to}
                  className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-500/5 sm:gap-6 sm:px-6"
                >
                  <span className={cn('cifra-kpi w-10 shrink-0 text-right sm:w-14', t.tono)}>{t.cantidad === null ? '—' : formatCantidad(t.cantidad)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{t.titulo}</span>
                    <span className="block text-sm opacity-65">{t.detalle}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-600 sm:inline-flex dark:text-brand-400">
                    Abrir <ChevronRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <ChevronRight size={18} className="shrink-0 opacity-50 sm:hidden" aria-hidden />
                </Link>
              ))}
            </GlassCard>
          ) : (
            <GlassCard className="text-sm">
              <p className="font-semibold">Todo al día.</p>
              <p className="opacity-65">Cuando algo necesite tu acción, aparecerá aquí.</p>
            </GlassCard>
          )}
          {alDia.length > 0 && conTrabajo.length > 0 && (
            <p className="px-1 text-sm opacity-60">Al día: {alDia.map((t) => t.titulo.charAt(0).toLowerCase() + t.titulo.slice(1)).join(', ')}.</p>
          )}
        </section>
      )}

      {(verProductos || verReclamos) && datos && (
        <section aria-labelledby="titulo-resumen" className="flex flex-col gap-2">
          <h2 id="titulo-resumen" className="etiqueta px-1">
            Así van los casos
          </h2>
          <div className={cn('grid gap-4', verProductos && verReclamos && 'lg:grid-cols-2')}>
            {verProductos && pd && (
              <GlassCard className="flex flex-col gap-4">
                <Encabezado titulo="Productos dañados" to="/productos-danados" />
                {/* La ruta de un reporte, en orden. NF es el desvío: va directo a Cerrado. */}
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  <Etapa n={pd.pendientes} label="Pendientes" to="/productos-danados?estado=Pendiente" />
                  <Flecha />
                  <Etapa n={pd.aprobados} label="Devolución aprobada" to="/productos-danados?estado=Aprobado" />
                  <Flecha />
                  <Etapa n={pd.enContabilidad} label="En contabilidad" to="/productos-danados?estado=EnContabilidad" />
                  <Flecha />
                  <Etapa n={pd.cerrados} label="Cerrados" to="/productos-danados?estado=Cerrado" />
                </ol>
                <p className="text-sm opacity-65">
                  NF (el proveedor no aprobó): con Gof{' '}
                  <Link to="/productos-danados?estado=Rechazado" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                    {formatCantidad(pd.rechazados)}
                  </Link>
                  {' · '}por validar{' '}
                  <Link to="/productos-danados?estado=NFValidacion" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
                    {formatCantidad(pd.nfValidacion)}
                  </Link>
                </p>
              </GlassCard>
            )}
            {verReclamos && rec && (
              <GlassCard className="flex flex-col gap-4">
                <Encabezado titulo="Reclamos" to="/reclamos" />
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
                  <Etapa n={rec.pendientes} label="Por decidir" to="/reclamos?estado=pendiente" />
                  <Flecha />
                  <Etapa n={rec.porEnviarContabilidad} label="Cerrados por enviar" to="/reclamos?porEnviar=1" />
                  <Flecha />
                  <Etapa n={rec.resueltos + rec.rechazados - rec.porEnviarContabilidad} label="En contabilidad" />
                </ol>
                <p className="text-sm opacity-65">
                  {formatCantidad(rec.productosPorDecidir)} productos esperando decisión · {formatCantidad(rec.notificados)} notificados (solo informativos)
                </p>
              </GlassCard>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Atajo({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      data-variant="primary"
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
    >
      <Plus size={16} aria-hidden /> {children}
    </Link>
  );
}

function Encabezado({ titulo, to }: { titulo: string; to: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold">{titulo}</h3>
      <Link to={to} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
        Ver todos
      </Link>
    </div>
  );
}

function Etapa({ n, label, to }: { n: number; label: string; to?: string }) {
  const contenido = (
    <>
      <span className={cn('cifra-kpi text-[1.75rem]', n === 0 && 'opacity-35')}>{formatCantidad(n)}</span>
      <span className="text-sm opacity-70">{label}</span>
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="flex flex-col rounded-xl px-3 py-2 transition-colors hover:bg-brand-500/5">
          {contenido}
        </Link>
      ) : (
        <span className="flex flex-col px-3 py-2">{contenido}</span>
      )}
    </li>
  );
}

function Flecha() {
  return (
    // En celular las etapas bajan de línea y la flecha quedaría suelta al final: solo desde tablet.
    <li aria-hidden className="hidden opacity-30 sm:block">
      <ArrowRight size={18} />
    </li>
  );
}
