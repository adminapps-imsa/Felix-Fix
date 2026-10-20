import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FilePlus2,
  FileCheck2,
  FileSearch,
  FileUp,
  FileWarning,
  LayoutDashboard,
  RefreshCw,
  Send,
  SendHorizontal,
  Undo2,
} from 'lucide-react';
import { BandaPagina, TituloPagina } from '../../components/ui/TituloPagina';
import { GlassCard } from '../../components/ui/GlassCard';
import { Cifra } from '../../components/ui/Cifra';
import { useIndicador } from '../../lib/useIndicador';
import { useAuth } from '../../auth/useAuth';
import { ACCESO_PRODUCTOS, P } from '../../auth/permisos';
import { cn } from '../../lib/cn';
import { formatCantidad, formatDuracion, formatFecha } from '../../lib/formatters';
import { nombreRol } from '../../lib/roles';
import { formatPrecio, TIPO_LABEL_CORTO } from '../reclamos/lib/tipos';
import type { TipoReclamo } from '../../types/reclamo';
import { ESTADO_LABEL } from '../../types/productoDanado';
import type { Estado } from '../../types/productoDanado';
import * as api from '../../api/tablero';
import type { Cola, EtapaAbierta, PeriodoTablero, Tablero, Tramo } from '../../types/tablero';
import { BarraProporcion, BarrasHorizontales, GraficoColumnas } from './components/graficos';

const PERIODOS: { dias: PeriodoTablero; label: string; largo: string }[] = [
  { dias: 7, label: '7 días', largo: 'los últimos 7 días' },
  { dias: 30, label: '30 días', largo: 'los últimos 30 días' },
  { dias: 90, label: '3 meses', largo: 'los últimos 3 meses' },
  { dias: 365, label: '12 meses', largo: 'los últimos 12 meses' },
];

const plural = (n: number, uno: string, varios: string) => `${formatCantidad(n)} ${n === 1 ? uno : varios}`;

/**
 * Tablero por rol. Pensado para leerse de un vistazo: arriba una frase con
 * lo que espera por ti; luego cada tarea como una tarjeta con su semáforo;
 * después la ruta de cada módulo (dónde están los casos y en qué paso se
 * demoran) con su gráfico; el desglose queda plegado en «Ver de dónde vienen».
 * Todo sale de los permisos del usuario, igual que Inicio.
 */
export function TableroPage() {
  const { puede, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const dias = (PERIODOS.find((p) => String(p.dias) === params.get('dias'))?.dias ?? 30) as PeriodoTablero;
  const [datos, setDatos] = useState<Tablero | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    api
      .obtenerTablero(dias)
      .then((d) => !cancelado && setDatos(d))
      .catch((e: Error) => !cancelado && setError(e.message || 'No se pudo cargar el tablero.'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [dias, intento]);

  const cambiarPeriodo = useCallback(
    (d: PeriodoTablero) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (d === 30) n.delete('dias');
          else n.set('dias', String(d));
          return n;
        },
        { replace: true }
      ),
    [setParams]
  );

  const periodo = PERIODOS.find((p) => p.dias === dias)!;
  const roles = user?.vista ? [user.vista] : [...(user?.roles ?? [])];
  const tareas = datos ? armarTareas(datos, puede) : [];
  // La pastilla blanca del periodo elegido se desliza hasta el nuevo.
  const selector = useIndicador<HTMLDivElement>('[aria-checked="true"]', dias);

  return (
    <div className="flex flex-col gap-8">
      <BandaPagina className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <TituloPagina icono={LayoutDashboard} titulo="Tablero">
          <p className="bajada-pagina text-white">Tu trabajo{roles.length ? ` como ${roles.map(nombreRol).join(' · ')}` : ''}, de un vistazo.</p>
        </TituloPagina>
        <div ref={selector.ref} role="radiogroup" aria-label="Periodo" className="relative flex w-full gap-1 rounded-full bg-white/15 p-1 ring-1 ring-white/25 backdrop-blur-sm sm:w-auto">
          {selector.pos && (
            <span
              aria-hidden
              className={cn('absolute rounded-full bg-white shadow-sm', selector.listo && 'transition-[left,width,top] duration-300 ease-[var(--ease-out)]')}
              style={{ left: selector.pos.left, top: selector.pos.top, width: selector.pos.width, height: selector.pos.height }}
            />
          )}
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              role="radio"
              aria-checked={p.dias === dias}
              onClick={() => cambiarPeriodo(p.dias)}
              className={cn(
                // El fondo blanco del elegido lo dibuja la pastilla que se desliza; aquí solo el color.
                'relative z-[1] flex-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-[background-color,color] duration-200 sm:flex-none',
                p.dias === dias ? 'text-brand-700' : 'text-white/85 hover:bg-white/10 hover:text-white'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </BandaPagina>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-danger">
            <AlertTriangle size={16} aria-hidden /> {error}
          </span>
          <button type="button" onClick={() => setIntento((i) => i + 1)} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline dark:text-brand-400">
            <RefreshCw size={14} aria-hidden /> Reintentar
          </button>
        </div>
      )}

      {!datos && cargando && <Esqueleto />}

      {datos && (
        <div className={cn('flex flex-col gap-8 transition-opacity duration-200', cargando && 'opacity-60')} aria-busy={cargando}>
          <Resumen datos={datos} tareas={tareas} puede={puede} periodo={periodo.largo} vistaPor={Boolean(user?.vista)} />
          {tareas.length > 0 && <Tareas tareas={tareas} />}
          <ComoVa datos={datos} puede={puede} periodo={periodo.largo} />
          <MasDetalle datos={datos} periodo={periodo.largo} />
          <p className="px-1 text-xs opacity-45">Actualizado {formatFecha(datos.periodo.generado)}</p>
        </div>
      )}
    </div>
  );
}

type Puede = (...permisos: string[]) => boolean;

// ---------- Tareas (lo que espera por ti) ----------

type Semaforo = 'aldia' | 'entiempo' | 'revisar' | 'atrasado';

interface TareaVista {
  id: string;
  icono: LucideIcon;
  titulo: string;
  cola: Cola<unknown>;
  to: string;
  /** El caso que lleva más tiempo, para «Empezar por el más antiguo». */
  masAntiguo: { to: string } | null;
}

/** Semáforo de una cola por lo que lleva su caso más antiguo: hasta 7 días en tiempo, 8–14 revisar, 15+ atrasado. */
function semaforo(c: Cola<unknown>): Semaforo {
  if (!c.total) return 'aldia';
  const max = c.maxDias ?? 0;
  return max >= 15 ? 'atrasado' : max >= 8 ? 'revisar' : 'entiempo';
}

const ETAPAS_PD: { estado: EtapaAbierta; titulo: string; icono: LucideIcon; permisos: string[] }[] = [
  { estado: 'Pendiente', titulo: 'Enviar al proveedor', icono: Send, permisos: [P.pdEnviar, P.pdAprobar] },
  { estado: 'Rechazado', titulo: 'Hacer el documento 1700', icono: FileWarning, permisos: [P.pdNfDocumento] },
  { estado: 'NFValidacion', titulo: 'Validar NF', icono: FileCheck2, permisos: [P.pdNf] },
  { estado: 'Aprobado', titulo: 'Enviar devoluciones a contabilidad', icono: FileUp, permisos: [P.pdDocumentar] },
  { estado: 'EnContabilidad', titulo: 'Registrar el pago del proveedor', icono: Banknote, permisos: [P.pdPago] },
];

function armarTareas(datos: Tablero, puede: Puede): TareaVista[] {
  const tareas: TareaVista[] = [];
  const { productos: pd, reclamos: rec, contabilidad: conta } = datos;
  // Contabilidad (solo «Confirmar pago») no tiene la pantalla de Productos Dañados: lo trabaja desde Contabilidad.
  const enlacePd = (estado: EtapaAbierta, id?: string) =>
    puede(...ACCESO_PRODUCTOS) ? `/productos-danados?estado=${estado}${id ? `&reporte=${id}` : ''}` : '/contabilidad?seccion=productos';

  if (pd)
    for (const e of ETAPAS_PD) {
      if (!puede(...e.permisos)) continue;
      const c = pd.colas[e.estado];
      const viejo = c.masAntiguos[0];
      tareas.push({ id: `pd-${e.estado}`, icono: e.icono, titulo: e.titulo, cola: c, to: enlacePd(e.estado), masAntiguo: viejo ? { to: enlacePd(e.estado, viejo.id) } : null });
    }
  if (rec && puede(P.recCrear) && rec.colas.devueltos) {
    const viejo = rec.colas.devueltos.masAntiguos[0];
    tareas.push({ id: 'rec-devueltos', icono: Undo2, titulo: 'Corregir reclamos devueltos', cola: rec.colas.devueltos, to: '/reclamos?estado=devuelto', masAntiguo: viejo ? { to: `/reclamos/${viejo.token}` } : null });
  }
  if (rec && puede(P.recDecidir)) {
    const viejo = rec.colas.porDecidir.masAntiguos[0];
    tareas.push({ id: 'rec-dec', icono: ClipboardCheck, titulo: 'Decidir reclamos', cola: rec.colas.porDecidir, to: '/reclamos?estado=pendiente', masAntiguo: viejo ? { to: `/reclamos/${viejo.token}` } : null });
  }
  if (rec && puede(P.recEnviarContabilidad)) {
    const viejo = rec.colas.porEnviar.masAntiguos[0];
    tareas.push({ id: 'rec-env', icono: SendHorizontal, titulo: 'Enviar reclamos a contabilidad', cola: rec.colas.porEnviar, to: '/reclamos?porEnviar=1', masAntiguo: viejo ? { to: `/reclamos/${viejo.token}` } : null });
  }
  if (conta) {
    const viejo = conta.cola.masAntiguos[0];
    tareas.push({ id: 'docs', icono: FileSearch, titulo: 'Revisar documentos de reclamos', cola: conta.cola, to: '/contabilidad', masAntiguo: viejo ? { to: `/contabilidad/${viejo.id}` } : null });
  }
  return tareas;
}

const ESTILO_SEMAFORO: Record<Semaforo, { texto: string; clase: string; icono: LucideIcon }> = {
  aldia: { texto: 'Al día', clase: 'bg-success/12 text-success', icono: CheckCircle2 },
  entiempo: { texto: 'En tiempo', clase: 'bg-brand-500/12 text-brand-600 dark:text-brand-400', icono: Clock },
  revisar: { texto: 'Revisar', clase: 'bg-warning/15 text-warning', icono: Clock },
  atrasado: { texto: 'Atrasado', clase: 'bg-danger/12 text-danger', icono: AlertTriangle },
};

function ChipSemaforo({ estado, dias }: { estado: Semaforo; dias: number | null }) {
  const s = ESTILO_SEMAFORO[estado];
  const Icono = s.icono;
  return (
    <span className={cn('badge-pill', s.clase)}>
      <Icono size={13} aria-hidden />
      {s.texto}
      {(estado === 'revisar' || estado === 'atrasado') && dias !== null && <span className="font-normal opacity-80">· {formatCantidad(Math.floor(dias))} días</span>}
    </span>
  );
}

// ---------- Resumen ----------

function Resumen({ datos, tareas, puede, periodo, vistaPor }: { datos: Tablero; tareas: TareaVista[]; puede: Puede; periodo: string; vistaPor: boolean }) {
  const total = tareas.reduce((s, t) => s + t.cola.total, 0);
  const atrasados = tareas.reduce((s, t) => s + (t.cola.rangos.find((r) => r.id === 'r3')?.n ?? 0), 0);
  const peor = tareas.filter((t) => t.cola.total).sort((a, b) => (b.cola.maxDias ?? 0) - (a.cola.maxDias ?? 0))[0];
  const estado: Semaforo = peor ? semaforo(peor.cola) : 'aldia';
  const acciones = lasAcciones(datos, puede);
  const Icono = ESTILO_SEMAFORO[estado].icono;

  // Quien solo reporta (Tienda) no tiene tareas: se le muestra en qué etapa están sus reportes.
  const mios = !tareas.length && puede(P.pdCrear) ? (Object.entries(datos.productos?.miTrabajo.misPorEstado ?? {}) as [Estado, number][]).filter(([, n]) => n > 0) : [];
  const enCurso = mios.filter(([e]) => e !== 'Cerrado').reduce((s, [, n]) => s + n, 0);

  const titulo = !tareas.length
    ? mios.length
      ? enCurso
        ? `${plural(enCurso, 'reporte tuyo sigue', 'reportes tuyos siguen')} en curso`
        : 'Tus reportes están cerrados'
      : 'Así va tu trabajo'
    : total
      ? `${plural(total, 'caso espera', 'casos esperan')} por ti`
      : 'Todo al día';
  const bajada = !tareas.length
    ? mios.length
      ? 'Así van:'
      : 'Desde aquí ves cómo avanzan los casos que creas.'
    : !total
      ? 'No tienes nada pendiente. Cuando algo necesite tu acción, aparecerá aquí.'
      : atrasados
        ? `${plural(atrasados, 'lleva', 'llevan')} 15 días o más. Empieza por el más antiguo.`
        : estado === 'revisar'
          ? 'Algunos llevan más de una semana. Revísalos pronto.'
          : 'Todo va en tiempo: ninguno lleva más de una semana.';

  return (
    <GlassCard className="grid !p-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', ESTILO_SEMAFORO[estado].clase)} aria-hidden>
          <Icono size={28} strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <h2 className="titulo-pagina !text-[1.75rem] sm:!text-[2rem]">{titulo}</h2>
            <p className="mt-1 text-[0.9375rem] opacity-70">{bajada}</p>
          </div>
          {mios.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {mios.map(([estado, n]) => (
                <li key={estado}>
                  <Link
                    to={`/productos-danados?estado=${estado}`}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3.5 py-1.5 text-sm transition-colors hover:border-brand-500/50 hover:bg-brand-500/5 dark:border-white/15"
                  >
                    {ESTADO_LABEL[estado] ?? estado}
                    <Cifra valor={n} className="font-semibold tabular-nums text-brand-600 dark:text-brand-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {peor?.masAntiguo && (
            <Link
              to={peor.masAntiguo.to}
              className="inline-flex items-center gap-2 self-start rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(79,70,229,0.3),0_4px_12px_-2px_rgba(79,70,229,0.35)] transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-brand-600 active:scale-[0.97] dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500"
            >
              Empezar por el más antiguo <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-black/5 p-5 sm:p-6 md:border-t-0 md:border-l dark:border-white/10">
        <h3 className="etiqueta">Lo que hiciste en {periodo}</h3>
        {acciones.length ? (
          <ul className="flex flex-col gap-2.5">
            {acciones.slice(0, 4).map((a, i) => (
              <li key={a.id} className="anim-fila flex items-center gap-3 text-sm" style={{ ['--i' as string]: i }}>
                <span className="chip-icono text-brand-600 dark:text-brand-400">
                  <a.icono size={15} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{a.etiqueta}</span>
                <Cifra valor={a.n} className="font-semibold tabular-nums" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm opacity-60">Todavía no registras acciones en este periodo.</p>
        )}
        {vistaPor && <p className="text-xs opacity-50">En «Vista por» esto sigue siendo lo que hiciste tú.</p>}
      </div>
    </GlassCard>
  );
}

/** Lo que hizo el usuario en el periodo: solo lo que tiene movimiento y es de sus permisos. */
function lasAcciones(datos: Tablero, puede: Puede) {
  const pd = datos.productos;
  const rec = datos.reclamos;
  const a = pd?.miTrabajo.acciones ?? {};
  const todas: { id: string; icono: LucideIcon; etiqueta: string; n: number; ok: boolean }[] = [
    { id: 'pd-crear', icono: FilePlus2, etiqueta: 'Reportes creados', n: pd?.miTrabajo.creados ?? 0, ok: puede(P.pdCrear) },
    { id: 'pd-env', icono: Send, etiqueta: 'Enviados al proveedor', n: a.EnviadoProveedor ?? 0, ok: puede(P.pdEnviar) },
    { id: 'pd-resp', icono: CheckCircle2, etiqueta: 'Respuestas del proveedor', n: (a.Aprobado ?? 0) + (a.Rechazado ?? 0), ok: puede(P.pdAprobar) },
    { id: 'pd-1700', icono: FileWarning, etiqueta: 'Documentos 1700', n: a.Documento1700 ?? 0, ok: puede(P.pdNfDocumento) },
    { id: 'pd-nf', icono: FileCheck2, etiqueta: 'NF validados', n: a.NFCerrado ?? 0, ok: puede(P.pdNf) },
    { id: 'pd-doc', icono: FileUp, etiqueta: 'Devoluciones a contabilidad', n: a.EnviadoContabilidad ?? 0, ok: puede(P.pdDocumentar) },
    { id: 'pd-pago', icono: Banknote, etiqueta: 'Pagos registrados', n: a.PagoRecibido ?? 0, ok: puede(P.pdPago) },
    { id: 'rec-crear', icono: FilePlus2, etiqueta: 'Reclamos creados', n: rec?.miTrabajo.creados ?? 0, ok: puede(P.recCrear) },
    { id: 'rec-prod', icono: ClipboardCheck, etiqueta: 'Productos decididos', n: (rec?.miTrabajo.productosAprobados ?? 0) + (rec?.miTrabajo.productosRechazados ?? 0), ok: puede(P.recDecidir) },
    { id: 'rec-env', icono: SendHorizontal, etiqueta: 'Reclamos a contabilidad', n: rec?.miTrabajo.enviados ?? 0, ok: puede(P.recEnviarContabilidad) },
    { id: 'docs', icono: FileSearch, etiqueta: 'Documentos recibidos', n: datos.contabilidad?.recibidos ?? 0, ok: Boolean(datos.contabilidad) },
  ];
  return todas.filter((x) => x.ok && x.n > 0).sort((x, y) => y.n - x.n);
}

function Tareas({ tareas }: { tareas: TareaVista[] }) {
  // Primero lo que tiene trabajo (lo más antiguo antes); lo que está al día, al final.
  const orden = [...tareas].sort((a, b) => Number(!a.cola.total) - Number(!b.cola.total) || (b.cola.maxDias ?? 0) - (a.cola.maxDias ?? 0));
  return (
    <Seccion titulo="Tus tareas">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {orden.map((t, i) => {
          const estado = semaforo(t.cola);
          return (
            // La cascada va en un envoltorio: así no compite con el «hundirse» del enlace al presionarlo.
            <div key={t.id} className="anim-fila" style={{ ['--i' as string]: i }}>
              <Link
                to={t.to}
                className={cn(
                  'glass-card group flex h-full items-center gap-4 p-4 transition-[box-shadow,transform] duration-150 ease-[var(--ease-out)] hover:shadow-[var(--glass-shadow-hover)] active:scale-[0.99] sm:flex-col sm:items-stretch sm:gap-3 sm:p-5',
                  !t.cola.total && 'opacity-70'
                )}
              >
                <span className="flex items-center justify-between gap-3 sm:w-full">
                  <span className="chip-icono size-10 text-brand-600 dark:text-brand-400">
                    <t.icono size={19} aria-hidden />
                  </span>
                  <Cifra valor={t.cola.total} className={cn('cifra-kpi hidden sm:block', !t.cola.total && 'opacity-30')} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="font-semibold leading-snug">{t.titulo}</span>
                  <span>
                    <ChipSemaforo estado={estado} dias={t.cola.maxDias} />
                  </span>
                </span>
                <Cifra valor={t.cola.total} className={cn('cifra-kpi text-[2rem] sm:hidden', !t.cola.total && 'opacity-30')} />
              </Link>
            </div>
          );
        })}
      </div>
    </Seccion>
  );
}

// ---------- Cómo van los casos (ruta + gráfico por módulo) ----------

type Modulo = 'productos' | 'reclamos' | 'contabilidad';

function ComoVa({ datos, puede, periodo }: { datos: Tablero; puede: Puede; periodo: string }) {
  const [activo, setActivo] = useState<Modulo | null>(null);
  const modulos = [
    datos.productos && { id: 'productos', label: 'Productos dañados' },
    datos.reclamos && { id: 'reclamos', label: 'Reclamos' },
    datos.contabilidad && { id: 'contabilidad', label: 'Contabilidad' },
  ].filter(Boolean) as { id: Modulo; label: string }[];
  const mod = modulos.find((m) => m.id === activo)?.id ?? modulos[0]?.id;
  // El fondo de la pestaña activa se desliza hasta la elegida (antes del return: es un hook).
  const pestanas = useIndicador<HTMLDivElement>('[aria-selected="true"]', mod);
  if (!modulos.length) return null;
  const gran = datos.periodo.granularidad;

  return (
    <Seccion titulo="Cómo van los casos">
      <GlassCard className="flex flex-col gap-6 sm:p-6">
        {modulos.length > 1 && (
          <div ref={pestanas.ref} role="tablist" aria-label="Módulo" className="relative -mx-1 flex gap-1 overflow-x-auto">
            {pestanas.pos && (
              <span
                aria-hidden
                className={cn('absolute rounded-full bg-brand-500/15', pestanas.listo && 'transition-[left,width,top] duration-300 ease-[var(--ease-out)]')}
                style={{ left: pestanas.pos.left, top: pestanas.pos.top, width: pestanas.pos.width, height: pestanas.pos.height }}
              />
            )}
            {modulos.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === mod}
                onClick={() => setActivo(m.id)}
                className={cn(
                  'relative z-[1] shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-[color,opacity,background-color] duration-200',
                  m.id === mod ? 'text-brand-600 dark:text-brand-400' : 'opacity-65 hover:bg-brand-500/5 hover:opacity-100'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {mod === 'productos' && datos.productos && (
          <>
            <Frase>
              En {periodo} entraron <b>{plural(sumar(datos.productos.serie, 'entradas'), 'reporte', 'reportes')}</b> y se cerraron{' '}
              <b>{formatCantidad(sumar(datos.productos.serie, 'salidas'))}</b>.
            </Frase>
            <RutasProductos datos={datos} puede={puede} />
            <Grafico>
              <GraficoColumnas
                serie={datos.productos.serie}
                granularidad={gran}
                series={[
                  { clave: 'entradas', nombre: 'Nuevos', color: 'var(--viz-1)' },
                  { clave: 'salidas', nombre: 'Cerrados', color: 'var(--viz-2)' },
                ]}
              />
            </Grafico>
          </>
        )}
        {mod === 'reclamos' && datos.reclamos && (
          <>
            <Frase>
              En {periodo} llegaron <b>{plural(sumar(datos.reclamos.serie, 'entradas'), 'reclamo', 'reclamos')}</b> y se decidieron{' '}
              <b>{formatCantidad(sumar(datos.reclamos.serie, 'salidas'))}</b>.
            </Frase>
            <Ruta
              pasos={[
                { label: 'Por decidir', n: datos.reclamos.colas.porDecidir.total, tuyo: puede(P.recDecidir) },
                { label: 'Por enviar a contabilidad', n: datos.reclamos.colas.porEnviar.total, tuyo: puede(P.recEnviarContabilidad) },
                { label: 'En contabilidad', final: true },
              ]}
              tramos={[datos.reclamos.tramos.decision, datos.reclamos.tramos.envioContabilidad]}
            />
            {(datos.reclamos.colas.devueltosTodos?.total ?? 0) > 0 && (
              <p className="-mt-2 flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400">
                <Undo2 size={15} aria-hidden />
                {plural(datos.reclamos.colas.devueltosTodos.total, 'reclamo está devuelto', 'reclamos están devueltos')} a quien los creó, esperando la corrección.
              </p>
            )}
            <Grafico>
              <GraficoColumnas
                serie={datos.reclamos.serie}
                granularidad={gran}
                series={[
                  { clave: 'entradas', nombre: 'Nuevos', color: 'var(--viz-1)' },
                  { clave: 'salidas', nombre: 'Decididos', color: 'var(--viz-2)' },
                ]}
              />
            </Grafico>
          </>
        )}
        {mod === 'contabilidad' && datos.contabilidad && (
          <>
            <Frase>
              En {periodo} recibiste <b>{plural(datos.contabilidad.recibidos, 'documento', 'documentos')}</b>
              {datos.contabilidad.recibidos > 0 && (
                <>
                  {' '}
                  por <b>{formatPrecio(datos.contabilidad.montoRecibido)}</b>
                </>
              )}
              .
            </Frase>
            <Grafico>
              <GraficoColumnas serie={datos.contabilidad.serie} granularidad={gran} series={[{ clave: 'entradas', nombre: 'Recibidos', color: 'var(--viz-1)' }]} />
            </Grafico>
          </>
        )}
      </GlassCard>
    </Seccion>
  );
}

const sumar = (serie: { entradas: number; salidas: number }[], clave: 'entradas' | 'salidas') => serie.reduce((s, p) => s + p[clave], 0);

function Frase({ children }: { children: React.ReactNode }) {
  return <p className="text-lg leading-snug [&_b]:font-semibold [&_b]:text-brand-600 dark:[&_b]:text-brand-400">{children}</p>;
}

function Grafico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-black/5 pt-5 dark:border-white/10">
      <h3 className="etiqueta">Día a día</h3>
      {children}
    </div>
  );
}

function RutasProductos({ datos, puede }: { datos: Tablero; puede: Puede }) {
  const pd = datos.productos!;
  const t = pd.tramos;
  const n = (e: EtapaAbierta) => pd.colas[e].total;
  // Gof (vista parcial) no ve lo que está con la compradora: su ruta empieza en la respuesta.
  // Mismo criterio que alcanceVista del backend: sin pdVerNf también se ve todo.
  const veTodo = puede(P.pdVer) || !puede(P.pdVerNf);
  const inicio: Paso[] = veTodo ? [{ label: 'Con la compradora', n: n('Pendiente'), tuyo: puede(P.pdEnviar, P.pdAprobar) }] : [];
  const tramoInicio = veTodo ? [t.respuesta] : [];
  return (
    <div className="flex flex-col gap-6">
      <Ruta
        titulo="Si el proveedor aprueba la devolución"
        pasos={[
          ...inicio,
          { label: 'Devolución aprobada', n: n('Aprobado'), tuyo: puede(P.pdDocumentar) },
          { label: 'En contabilidad', n: n('EnContabilidad'), tuyo: puede(P.pdPago) },
          { label: 'Cerrado', final: true },
        ]}
        tramos={[...tramoInicio, t.enviarContabilidad, t.pago]}
      />
      <Ruta
        titulo="Si es NF"
        pasos={[
          ...inicio,
          { label: 'Falta el 1700', n: n('Rechazado'), tuyo: puede(P.pdNfDocumento) },
          { label: 'Por validar', n: n('NFValidacion'), tuyo: puede(P.pdNf) },
          { label: 'Cerrado', final: true },
        ]}
        tramos={[...tramoInicio, t.documento1700, t.validarNf]}
      />
    </div>
  );
}

interface Paso {
  label: string;
  n?: number;
  tuyo?: boolean;
  final?: boolean;
}

/**
 * La ruta de un caso: cada etapa con cuántos casos están ahí ahora y, entre
 * etapas, cuánto se tarda en promedio. El paso más lento se marca en ámbar;
 * las etapas que trabaja el usuario llevan borde de color.
 */
function Ruta({ titulo, pasos, tramos }: { titulo?: string; pasos: Paso[]; tramos: Tramo[] }) {
  // Quien trabaja todas las etapas (Administrador) no necesita la marca: no distingue nada.
  if (pasos.filter((p) => !p.final).every((p) => p.tuyo)) pasos = pasos.map((p) => ({ ...p, tuyo: false }));
  const conDatos = tramos.filter((t) => t.promedioDias !== null && t.n > 0);
  const masLento = conDatos.length > 1 ? conDatos.reduce((a, b) => ((b.promedioDias ?? 0) > (a.promedioDias ?? 0) ? b : a)) : null;
  // Solo vale la pena señalarlo si de verdad tarda (más de un día).
  const lento = masLento && (masLento.promedioDias ?? 0) >= 1 ? tramos.indexOf(masLento) : -1;
  return (
    <div className="flex flex-col gap-3">
      {titulo && <h3 className="etiqueta">{titulo}</h3>}
      {/* Cada paso es un <li> real (con su conector dentro): display:contents
          hace que Safari pierda la semántica de lista. Los <li> con conector
          crecen (flex-1) y el último queda del ancho del paso, como antes. */}
      <ol role="list" className="flex flex-col sm:flex-row sm:items-start">
        {pasos.map((p, i) => (
          <li key={p.label} className={cn('flex flex-col sm:flex-row sm:items-start', i < pasos.length - 1 && 'sm:flex-1')}>
            <div className="flex items-center gap-3 sm:w-28 sm:shrink-0 sm:flex-col sm:gap-2 sm:text-center">
              <span
                className={cn(
                  'grid size-12 shrink-0 place-items-center rounded-full text-lg font-bold tabular-nums',
                  p.final ? 'bg-success/12 text-success' : p.tuyo ? 'bg-brand-500/12 text-brand-600 ring-2 ring-brand-500 dark:text-brand-400 dark:ring-brand-400' : 'bg-black/[0.04] dark:bg-white/[0.06]',
                  !p.final && !p.n && !p.tuyo && 'opacity-50'
                )}
              >
                {p.final ? <Check size={20} aria-label="Cerrado" /> : <Cifra valor={p.n ?? 0} />}
              </span>
              <span className="text-sm leading-tight">
                {p.label}
                {p.tuyo && <span className="block text-xs font-semibold text-brand-600 dark:text-brand-400">Tu etapa</span>}
              </span>
            </div>
            {i < pasos.length - 1 && <Conector tramo={tramos[i]} lento={i === lento} indice={i} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Conector({ tramo, lento, indice }: { tramo?: Tramo; lento: boolean; indice: number }) {
  const texto = tramo && tramo.promedioDias !== null && tramo.n > 0 ? formatDuracion(tramo.promedioDias) : null;
  return (
    <div
      className={cn(
        // En escritorio la línea es un trazo aparte que se dibuja de izquierda a derecha (en celular, el borde de siempre).
        'relative ml-6 flex min-h-9 items-center gap-1.5 border-l-2 pl-5 text-xs sm:mx-1 sm:mt-6 sm:min-h-0 sm:flex-1 sm:flex-col sm:gap-0.5 sm:border-l-0 sm:pl-0 sm:pt-2 sm:text-center',
        lento ? 'border-warning text-warning' : 'border-black/10 dark:border-white/15'
      )}
      title={tramo?.n ? `Promedio de ${plural(tramo.n, 'caso', 'casos')}` : 'Sin casos en este periodo'}
    >
      <span
        aria-hidden
        className={cn('anim-ancho absolute inset-x-0 top-0 hidden h-0.5 sm:block', lento ? 'bg-warning' : 'bg-black/10 dark:bg-white/15')}
        style={{ ['--i' as string]: indice }}
      />
      <span className={cn('whitespace-nowrap', lento ? 'font-semibold' : 'opacity-55')}>{texto ?? 'sin datos'}</span>
      {lento && <span className="whitespace-nowrap font-semibold">aquí se demora más</span>}
    </div>
  );
}

// ---------- De dónde vienen (plegado) ----------

function MasDetalle({ datos, periodo }: { datos: Tablero; periodo: string }) {
  const { productos: pd, reclamos: rec, contabilidad: conta } = datos;
  if (!pd && !rec && !conta) return null;
  const prod = (estado: string) => rec?.desglose.productos.find((p) => p.etiqueta === estado)?.n ?? 0;
  return (
    <details className="group">
      <summary className="glass-card flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold transition-shadow hover:shadow-[var(--glass-shadow-hover)] [&::-webkit-details-marker]:hidden">
        <span>
          Ver de dónde vienen los casos
          <span className="block text-sm font-normal opacity-60">Tiendas, motivos, divisiones y proveedores de {periodo}.</span>
        </span>
        <ChevronDown size={20} className="shrink-0 opacity-60 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="anim-aparecer mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pd && (
          <>
            <Tarjeta titulo="Reportes por tienda">
              <BarrasHorizontales filas={pd.desglose.porTienda} />
            </Tarjeta>
            <Tarjeta titulo="Reportes por motivo">
              <BarrasHorizontales filas={pd.desglose.porMotivo} />
            </Tarjeta>
            <Tarjeta titulo="Reportes por división">
              <BarrasHorizontales filas={pd.desglose.porDivision} />
              <h4 className="etiqueta mt-2">Respuesta del proveedor</h4>
              <BarraProporcion
                partes={[
                  { etiqueta: 'Devolución', n: pd.resoluciones.devolucion, color: 'var(--viz-1)' },
                  { etiqueta: 'NF', n: pd.resoluciones.nf, color: 'var(--viz-2)' },
                ]}
              />
            </Tarjeta>
          </>
        )}
        {rec && (
          <>
            <Tarjeta titulo="Reclamos por tipo">
              <BarrasHorizontales filas={rec.desglose.porTipo.map((f) => ({ ...f, etiqueta: TIPO_LABEL_CORTO[f.etiqueta as TipoReclamo] ?? f.etiqueta }))} />
            </Tarjeta>
            <Tarjeta titulo="Reclamos por proveedor">
              <BarrasHorizontales filas={rec.desglose.porProveedor} />
            </Tarjeta>
            <Tarjeta titulo="Productos reclamados">
              <BarraProporcion
                partes={[
                  { etiqueta: 'Aprobados', n: prod('aprobado'), color: 'var(--viz-1)' },
                  { etiqueta: 'Rechazados', n: prod('rechazado'), color: 'var(--viz-2)' },
                  { etiqueta: 'Por decidir', n: prod('pendiente'), color: 'color-mix(in oklab, currentColor 25%, transparent)' },
                ]}
              />
            </Tarjeta>
          </>
        )}
        {conta && (
          <Tarjeta titulo="Notas de débito por proveedor">
            <BarrasHorizontales filas={conta.porProveedor} valor={(f) => f.monto ?? 0} formato={(n) => formatPrecio(n)} />
          </Tarjeta>
        )}
      </div>
    </details>
  );
}

// ---------- Piezas ----------

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const id = `sec-${titulo.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="numero-caso px-1 text-xl">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <GlassCard className="flex min-w-0 flex-col gap-4">
      <h3 className="font-semibold">{titulo}</h3>
      {children}
    </GlassCard>
  );
}

function Esqueleto() {
  const bloque = 'animate-pulse rounded-[var(--radius-card)] bg-black/[0.05] dark:bg-white/[0.06]';
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Cargando el tablero">
      <div className={cn(bloque, 'h-44')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn(bloque, 'h-36')} />
        ))}
      </div>
      <div className={cn(bloque, 'h-96')} />
    </div>
  );
}
