import { useMemo, useState } from 'react';
import { Check, ChevronRight, RotateCcw, Search, ShieldCheck, X } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { cn } from '../../../lib/cn';
import { formatCantidad } from '../../../lib/formatters';
import type { DecStatus, ReclamoLinea, TipoReclamo } from '../../../types/reclamo';
import { TIPO_LABEL, ordenTipo, formatPrecio } from '../lib/tipos';

interface Grupo {
  tipo: TipoReclamo;
  lineas: ReclamoLinea[];
  auto: boolean;
}

type Filtro = DecStatus | 'todos';

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: 'pendiente', label: 'Por decidir' },
  { valor: 'aprobado', label: 'Aprobados' },
  { valor: 'rechazado', label: 'Rechazados' },
  { valor: 'todos', label: 'Todos' },
];

/**
 * Productos del reclamo. Los que requieren decisión manual van en una lista
 * compacta con filtro por estado, búsqueda y selección múltiple, dentro de un
 * recuadro con su propio scroll (un reclamo puede traer cientos de productos
 * y la página no debe volverse interminable). Al final, colapsados, los
 * aprobados automáticamente por su tipo.
 */
export function ProductosSection({
  token,
  lineas,
  esAdmin,
  cerrado,
  onLineaActualizada,
  onLineasActualizadas,
}: {
  token: string;
  lineas: ReclamoLinea[];
  esAdmin: boolean;
  cerrado: boolean;
  onLineaActualizada: (linea: ReclamoLinea) => void;
  onLineasActualizadas: (lineas: ReclamoLinea[]) => void;
}) {
  const manuales = useMemo(() => lineas.filter((l) => !l.AutoAprobado), [lineas]);
  const automaticos = useMemo(() => {
    const map = new Map<TipoReclamo, ReclamoLinea[]>();
    for (const l of lineas) if (l.AutoAprobado) map.set(l.Tipo, [...(map.get(l.Tipo) || []), l]);
    return [...map.entries()]
      .map(([tipo, ls]): Grupo => ({ tipo, lineas: ls, auto: true }))
      .sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo));
  }, [lineas]);

  const conteo = useMemo(() => {
    const c = { pendiente: 0, aprobado: 0, rechazado: 0 };
    for (const l of manuales) c[l.DecStatus] += 1;
    return c;
  }, [manuales]);
  const variosTipos = new Set(manuales.map((l) => l.Tipo)).size > 1;
  const editable = esAdmin && !cerrado;

  const [filtro, setFiltro] = useState<Filtro>(() => (manuales.some((l) => l.DecStatus === 'pendiente') ? 'pendiente' : 'todos'));
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return manuales
      .filter((l) => filtro === 'todos' || l.DecStatus === filtro)
      .filter(
        (l) =>
          !q ||
          l.CodigoBarra.toLowerCase().includes(q) ||
          (l.Descripcion || '').toLowerCase().includes(q) ||
          String(l.Posicion) === q
      )
      .sort((a, b) => ordenTipo(a.Tipo) - ordenTipo(b.Tipo) || a.Posicion - b.Posicion);
  }, [manuales, filtro, busqueda]);

  // Solo cuentan los seleccionados que siguen pendientes (otro usuario pudo decidirlos).
  const pendientesSeleccionados = manuales.filter((l) => l.DecStatus === 'pendiente' && seleccion.has(l.Posicion)).map((l) => l.Posicion);
  const visiblesPendientes = visibles.filter((l) => l.DecStatus === 'pendiente');
  const todosVisiblesMarcados = visiblesPendientes.length > 0 && visiblesPendientes.every((l) => seleccion.has(l.Posicion));

  const alternar = (pos: number) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(pos)) n.delete(pos);
      else n.add(pos);
      return n;
    });
  const alternarVisibles = () =>
    setSeleccion((s) => {
      const n = new Set(s);
      for (const l of visiblesPendientes) {
        if (todosVisiblesMarcados) n.delete(l.Posicion);
        else n.add(l.Posicion);
      }
      return n;
    });

  if (!lineas.length) {
    return (
      <GlassCard>
        <h2 className="mb-1 text-base font-bold">Productos</h2>
        <p className="text-sm opacity-60">No se pudo extraer el detalle de productos del Excel. Revisa el archivo adjunto.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {manuales.length > 0 && (
        <GlassCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">
              Productos <span className="font-normal opacity-60">· {lineas.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Contador valor={conteo.pendiente} label="por decidir" clase="border-warning/30 bg-warning/15 text-warning" />
              <Contador valor={conteo.aprobado} label="aprobados" clase="border-success/30 bg-success/15 text-success" />
              <Contador valor={conteo.rechazado} label="rechazados" clase="border-danger/30 bg-danger/15 text-danger" />
              {lineas.length > manuales.length && (
                <Contador valor={lineas.length - manuales.length} label="automáticos" clase="border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5" />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]" role="tablist">
              {FILTROS.map((f) => {
                const n = f.valor === 'todos' ? manuales.length : conteo[f.valor];
                return (
                  <button
                    key={f.valor}
                    type="button"
                    role="tab"
                    aria-selected={filtro === f.valor}
                    onClick={() => setFiltro(f.valor)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition',
                      filtro === f.valor ? 'bg-white shadow-sm dark:bg-slate-700' : 'opacity-70 hover:opacity-100'
                    )}
                  >
                    {f.label} <span className="tabular-nums opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
            <label className="relative sm:w-72">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                className="h-8 w-full rounded-lg border border-black/10 bg-white/70 pl-8 pr-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/50 dark:border-white/10 dark:bg-white/5"
                placeholder="Buscar por código, descripción o #"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>
          </div>

          {editable && pendientesSeleccionados.length > 0 && (
            <DecisionMasiva
              token={token}
              posiciones={pendientesSeleccionados}
              onHecho={(ls) => {
                onLineasActualizadas(ls);
                setSeleccion(new Set());
              }}
              onCancelar={() => setSeleccion(new Set())}
            />
          )}

          <div className="max-h-[min(65vh,620px)] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
            <div
              className={cn(
                editable ? FILA_GRID_SEL : FILA_GRID,
                // Mismo borde izquierdo que las filas (su color de decisión): sin él, las columnas quedan corridas 3 px.
                'sticky top-0 z-10 hidden border-b border-l-[3px] border-black/10 border-l-transparent bg-[var(--page-bg)] py-2 text-[13px] font-semibold md:grid dark:border-white/10 dark:border-l-transparent'
              )}
            >
              {editable && (
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  aria-label="Seleccionar todos los pendientes visibles"
                  checked={todosVisiblesMarcados}
                  disabled={!visiblesPendientes.length}
                  onChange={alternarVisibles}
                />
              )}
              <span className="opacity-60">#</span>
              <span className="opacity-60">Producto</span>
              <span className="text-right opacity-60">Cant.</span>
              <span className="text-right opacity-60">Precio venta</span>
              <span className="opacity-60">Decisión</span>
            </div>
            {visibles.length ? (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {visibles.map((l) => (
                  <ProductoFila
                    key={l.Posicion}
                    token={token}
                    linea={l}
                    esAdmin={esAdmin}
                    cerrado={cerrado}
                    mostrarTipo={variosTipos}
                    seleccionado={seleccion.has(l.Posicion)}
                    onSeleccionar={editable ? () => alternar(l.Posicion) : undefined}
                    onActualizada={onLineaActualizada}
                  />
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm opacity-60">
                {busqueda ? 'Ningún producto coincide con la búsqueda.' : filtro === 'pendiente' ? 'No quedan productos por decidir.' : 'No hay productos en este estado.'}
              </p>
            )}
          </div>
          {visibles.length > 8 && <p className="-mt-2 text-xs opacity-50">Mostrando {visibles.length} de {manuales.length}. Desplázate dentro del recuadro para ver el resto.</p>}
        </GlassCard>
      )}

      {automaticos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 etiqueta">
            <ShieldCheck size={14} /> Aprobados automáticamente
            {!manuales.length && <span className="normal-case tracking-normal">· {lineas.length} productos</span>}
          </h3>
          {automaticos.map((g) => (
            <GrupoAutomatico key={g.tipo} grupo={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function Contador({ valor, label, clase }: { valor: number; label: string; clase: string }) {
  return (
    <span className={cn('badge-pill border px-2 py-0.5', clase)}>
      <span className="tabular-nums">{valor}</span> {label}
    </span>
  );
}

/** Barra para aprobar o rechazar de una vez los productos seleccionados. */
function DecisionMasiva({
  token,
  posiciones,
  onHecho,
  onCancelar,
}: {
  token: string;
  posiciones: number[];
  onHecho: (lineas: ReclamoLinea[]) => void;
  onCancelar: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decidir = async (decision: 'aprobado' | 'rechazado') => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiReclamos.decidirLineas(token, posiciones, decision, comentario);
      onHecho(r.lineas);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 p-2.5 md:flex-row md:items-center">
      <span className="shrink-0 px-1 text-sm font-semibold">
        {posiciones.length} seleccionado{posiciones.length === 1 ? '' : 's'}
      </span>
      <input
        className="h-8 min-w-0 flex-1 rounded-lg border border-black/10 bg-white/80 px-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/50 dark:border-white/10 dark:bg-white/5"
        placeholder="Comentario para todos (opcional)"
        value={comentario}
        maxLength={500}
        onChange={(e) => setComentario(e.target.value)}
      />
      <div className="flex gap-1.5">
        <button type="button" className={cn(MINI_BOTON, 'flex-1 justify-center hover:bg-black/5 md:flex-none dark:hover:bg-white/5')} disabled={busy} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className={cn(MINI_BOTON, 'flex-1 justify-center bg-danger text-white hover:bg-red-600 md:flex-none')} disabled={busy} onClick={() => decidir('rechazado')}>
          <X size={13} /> Rechazar {posiciones.length}
        </button>
        <button
          type="button"
          className={cn(MINI_BOTON, 'flex-1 justify-center bg-brand-500 text-white hover:bg-brand-600 md:flex-none dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500')}
          disabled={busy}
          onClick={() => decidir('aprobado')}
        >
          <Check size={13} /> Aprobar {posiciones.length}
        </button>
      </div>
      {error && <p className="text-xs text-danger md:basis-full">{error}</p>}
    </div>
  );
}

function GrupoAutomatico({ grupo }: { grupo: Grupo }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="glass-card overflow-hidden">
      <button onClick={() => setAbierto((a) => !a)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-brand-500/5">
        <ChevronRight size={16} className={cn('shrink-0 transition-transform duration-200 ease-[var(--ease-out)]', abierto && 'rotate-90')} />
        <span className="font-semibold">{TIPO_LABEL[grupo.tipo]}</span>
        <span className="opacity-60">· {grupo.lineas.length}</span>
        <span className="ml-auto text-xs text-success">aprobado automático</span>
      </button>
      {abierto && (
        <div className="anim-aparecer overflow-x-auto border-t border-black/5 dark:border-white/5">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs opacity-60">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Descripción</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">Precio venta</th>
              </tr>
            </thead>
            <tbody>
              {grupo.lineas.map((l) => (
                <tr key={l.Posicion} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-2 opacity-50">{l.Posicion}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {l.CodigoBarra}
                    {l.Encontrado === false && <span className="ml-1 text-danger">(no en SAP)</span>}
                  </td>
                  <td className="px-4 py-2">{l.Descripcion || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.Cantidad === null ? '—' : formatCantidad(l.Cantidad)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrecio(l.PrecioVenta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Columnas en escritorio: [selección], #, producto, cantidad, precio, decisión.
// En celular: casilla a la izquierda y el resto apilado a la derecha.
// El producto tiene un ancho máximo (el nombre largo se corta y se ve completo al pasar el ratón):
// si se llevara todo el sobrante, quedaría un hueco grande antes de "Cant.". El sobrante va al final, en Decisión.
const FILA_GRID = 'px-3 md:grid md:grid-cols-[2.25rem_minmax(0,26rem)_4rem_6rem_minmax(0,1fr)] md:items-center md:gap-3';
const FILA_GRID_SEL =
  'grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5 px-3 md:grid-cols-[1.25rem_2.25rem_minmax(0,26rem)_4rem_6rem_minmax(0,1fr)] md:items-center md:gap-3';

const MINI_BOTON =
  'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-[background-color,color,transform,opacity] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

/** Un producto por fila, compacto: datos a la izquierda y la decisión a la derecha. */
function ProductoFila({
  token,
  linea: l,
  esAdmin,
  cerrado,
  mostrarTipo,
  seleccionado,
  onSeleccionar,
  onActualizada,
}: {
  token: string;
  linea: ReclamoLinea;
  esAdmin: boolean;
  cerrado: boolean;
  mostrarTipo: boolean;
  seleccionado: boolean;
  /** Presente solo si se puede decidir; la casilla solo se habilita en pendientes. */
  onSeleccionar?: () => void;
  onActualizada: (linea: ReclamoLinea) => void;
}) {
  const [comentario, setComentario] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<ReclamoLinea>) => {
    setBusy(true);
    setError(null);
    try {
      onActualizada(await fn());
      setComentario('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setBusy(false);
    }
  };

  const decidido = l.DecStatus !== 'pendiente';
  // En celular, con casilla, todo lo que no es la casilla va en la 2ª columna.
  const col2 = onSeleccionar ? 'col-start-2 md:col-start-auto' : '';
  return (
    <div
      data-producto
      className={cn(
        onSeleccionar ? FILA_GRID_SEL : cn(FILA_GRID, 'flex flex-col'),
        'gap-y-2 border-l-[3px] py-2.5 text-sm',
        l.DecStatus === 'aprobado' && 'border-l-success bg-success/5',
        l.DecStatus === 'rechazado' && 'border-l-danger bg-danger/5',
        !decidido && (seleccionado ? 'border-l-brand-500 bg-brand-500/5' : 'border-l-transparent')
      )}
    >
      {onSeleccionar && (
        <input
          type="checkbox"
          className="row-span-3 mt-0.5 h-4 w-4 self-start accent-brand-500 disabled:opacity-30 md:row-span-1 md:mt-0 md:self-center"
          aria-label={`Seleccionar producto ${l.Posicion}`}
          checked={seleccionado && !decidido}
          disabled={decidido}
          onChange={onSeleccionar}
        />
      )}
      <span className="hidden text-xs tabular-nums opacity-50 md:block">{l.Posicion}</span>

      <div className={cn('min-w-0', col2)}>
        <div className="truncate font-medium" title={l.Descripcion || undefined}>
          {l.Descripcion || 'Sin descripción'}
        </div>
        <div className="truncate text-xs opacity-60">
          <span className="md:hidden">#{l.Posicion} · </span>
          <span className="font-mono">{l.CodigoBarra}</span>
          {l.Encontrado === false && <span className="ml-1 text-danger">· no encontrado en SAP</span>}
          {mostrarTipo && <span className="ml-1">· {TIPO_LABEL[l.Tipo]}</span>}
        </div>
      </div>

      <div className={cn('flex gap-4 text-xs md:contents md:text-sm', col2)}>
        <span className="tabular-nums md:text-right">
          <span className="opacity-60 md:hidden">Cant. </span>
          <strong className="font-semibold">{l.Cantidad === null ? '—' : formatCantidad(l.Cantidad)}</strong>
        </span>
        <span className="tabular-nums md:text-right">
          <span className="opacity-60 md:hidden">Precio venta </span>
          {formatPrecio(l.PrecioVenta)}
        </span>
      </div>

      <div className={cn('min-w-0', col2)}>
        {decidido ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:flex-nowrap">
            <span
              className={cn(
                'badge-pill shrink-0 border px-2 py-0.5',
                l.DecStatus === 'aprobado' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'
              )}
            >
              {l.DecStatus === 'aprobado' ? <Check size={12} /> : <X size={12} />}
              {l.DecStatus === 'aprobado' ? 'Aprobado' : 'Rechazado'}
            </span>
            <span className="order-last min-w-0 basis-full md:order-none md:flex-1 md:basis-auto md:truncate" title={l.DecComentario || undefined}>
              {l.DecBy && <span className="opacity-60">por {l.DecByNombre || l.DecBy}</span>}
              {l.DecComentario && <span className="opacity-80"> · “{l.DecComentario}”</span>}
            </span>
            {esAdmin && !cerrado && (
              <button
                type="button"
                className={cn(MINI_BOTON, 'ml-auto px-2 md:ml-0 hover:bg-black/5 dark:hover:bg-white/5')}
                disabled={busy}
                title="Deshacer decisión"
                onClick={() => run(() => apiReclamos.deshacerLinea(token, l.Posicion))}
              >
                <RotateCcw size={13} /> Deshacer
              </button>
            )}
          </div>
        ) : esAdmin && !cerrado ? (
          <div className="flex flex-wrap items-center gap-1.5 md:max-w-md md:flex-nowrap">
            <input
              className="h-8 min-w-0 basis-full rounded-lg md:flex-1 md:basis-auto border border-black/10 bg-white/70 px-2.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/50 dark:border-white/10 dark:bg-white/5"
              placeholder="Comentario (opcional)"
              aria-label={`Comentario para el producto ${l.Posicion}`}
              value={comentario}
              maxLength={500}
              onChange={(e) => setComentario(e.target.value)}
            />
            <button
              type="button"
              className={cn(MINI_BOTON, 'flex-1 justify-center md:flex-none bg-danger text-white hover:bg-red-600')}
              disabled={busy}
              onClick={() => run(() => apiReclamos.decidirLinea(token, l.Posicion, 'rechazado', comentario))}
            >
              <X size={13} /> Rechazar
            </button>
            <button
              type="button"
              className={cn(MINI_BOTON, 'flex-1 justify-center md:flex-none bg-brand-500 text-white hover:bg-brand-600 dark:bg-brand-400 dark:text-slate-950 dark:hover:bg-brand-500')}
              disabled={busy}
              onClick={() => run(() => apiReclamos.decidirLinea(token, l.Posicion, 'aprobado', comentario))}
            >
              <Check size={13} /> Aprobar
            </button>
          </div>
        ) : (
          <span className="text-xs text-warning">Pendiente de revisión</span>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
