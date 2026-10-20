import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Mail, Monitor, Search, Send, Smartphone, X, XCircle } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Esqueleto } from '../../../components/ui/Esqueleto';
import { BotonReintentar, EstadoVacio } from '../../../components/ui/EstadoVacio';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiConfig from '../../../api/configuracion';
import type { CorreoInfo, CorreoVista, ResultadoBienvenida, UsuarioConfig } from '../../../api/configuracion';
import { cn } from '../../../lib/cn';
import { nombreRol } from '../../../lib/roles';

const mensaje = (e: unknown, porDefecto: string) => (e instanceof ApiError ? e.message : porDefecto);

/** Palomita breve en un botón al terminar: vuelve a la normalidad a los 1.5 s. */
function useListo() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => setListo(false), 1500);
    return () => clearTimeout(t);
  }, [listo]);
  return [listo, setListo] as const;
}

/**
 * Los correos que manda el portal: cuándo sale cada uno, quién lo recibe y
 * cómo se ve (con datos de ejemplo). La bienvenida, además, se envía desde aquí.
 */
export function CorreosTab() {
  const [correos, setCorreos] = useState<CorreoInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState('bienvenida');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setError(null);
    apiConfig
      .listarCorreos()
      .then(setCorreos)
      .catch((e) => setError(mensaje(e, 'No se pudieron cargar los correos.')));
  }, [intento]);

  const grupos = useMemo(() => {
    const m = new Map<string, CorreoInfo[]>();
    for (const c of correos ?? []) m.set(c.grupo, [...(m.get(c.grupo) ?? []), c]);
    return [...m.entries()];
  }, [correos]);

  if (error)
    return (
      <GlassCard className="p-0">
        <EstadoVacio icono={Mail} tono="error" titulo="No se pudieron cargar los correos" texto={error} accion={<BotonReintentar onClick={() => setIntento((n) => n + 1)} />} />
      </GlassCard>
    );
  if (!correos) return <EsqueletoCorreos />;
  const info = correos.find((c) => c.id === elegido) ?? correos[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <GlassCard className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto !p-3 lg:sticky lg:top-24 lg:self-start">
        <p className="px-2 pt-1 text-sm opacity-65">{correos.length} correos. Elige uno para ver cómo llega.</p>
        {grupos.map(([grupo, lista]) => (
          <div key={grupo} className="flex flex-col gap-0.5">
            <h3 className="etiqueta px-2 pb-1">{grupo}</h3>
            {lista.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setElegido(c.id)}
                aria-current={c.id === info.id ? 'true' : undefined}
                className={cn(
                  'flex flex-col rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  c.id === info.id ? 'bg-brand-500/12 text-brand-700 dark:text-brand-300' : 'hover:bg-brand-500/5'
                )}
              >
                <span className="font-semibold leading-snug">{c.nombre}</span>
                <span className="truncate text-xs opacity-60">{c.quien}</span>
              </button>
            ))}
          </div>
        ))}
      </GlassCard>

      <div className="flex min-w-0 flex-col gap-4">
        <VistaCorreo key={info.id} info={info} />
        {info.id === 'bienvenida' && <EnviarBienvenida />}
      </div>
    </div>
  );
}

function VistaCorreo({ info }: { info: CorreoInfo }) {
  const [vista, setVista] = useState<CorreoVista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState<'escritorio' | 'celular'>('escritorio');
  const [modo, setModo] = useState<'html' | 'texto'>('html');
  const [alto, setAlto] = useState(700);
  const [prueba, setPrueba] = useState<{ estado: 'enviando' | 'ok' | 'error'; texto?: string } | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [listo, setListo] = useListo();
  const avisos = useAvisos();

  useEffect(() => {
    let vivo = true;
    apiConfig
      .verCorreo(info.id)
      .then((v) => vivo && setVista(v))
      .catch((e) => vivo && setError(mensaje(e, 'No se pudo armar la vista previa.')));
    return () => {
      vivo = false;
    };
  }, [info.id]);

  // El marco crece hasta el alto del correo: sin barra de desplazamiento propia.
  const medir = () => {
    const doc = iframe.current?.contentDocument;
    if (doc) setAlto(Math.max(300, doc.documentElement.scrollHeight + 4));
  };
  useEffect(() => {
    // Después de que el marco cambia de ancho (la transición dura 200 ms), el correo se acomoda y cambia de alto.
    const t = setTimeout(medir, 260);
    return () => clearTimeout(t);
  }, [ancho]);

  const enviarPrueba = async () => {
    setPrueba({ estado: 'enviando' });
    try {
      const { para } = await apiConfig.enviarPruebaCorreo(info.id);
      setPrueba({ estado: 'ok', texto: `Te lo enviamos a ${para.join(', ')} con «[PRUEBA]» en el asunto.` });
      setListo(true);
      avisos.ok(`Prueba de «${info.nombre}» enviada.`);
    } catch (e) {
      setPrueba({ estado: 'error', texto: mensaje(e, 'No se pudo enviar la prueba.') });
    }
  };

  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Mail size={17} className="text-brand-600 dark:text-brand-400" aria-hidden /> {info.nombre}
          </h2>
          <p className="mt-0.5 text-sm opacity-70">
            <span className="opacity-70">Asunto:</span> {info.asunto}
          </p>
        </div>
        <Button variant="secondary" onClick={enviarPrueba} estado={prueba?.estado === 'enviando' ? 'cargando' : listo ? 'listo' : null}>
          <Send size={15} /> {prueba?.estado === 'enviando' ? 'Enviando…' : 'Enviarme una prueba'}
        </Button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
          <dt className="etiqueta">Cuándo sale</dt>
          <dd>{info.cuando}</dd>
        </div>
        <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.05]">
          <dt className="etiqueta">Quién lo recibe</dt>
          <dd>{info.quien}</dd>
        </div>
      </dl>

      {prueba && prueba.estado !== 'enviando' && (
        <p className={cn('anim-aparecer flex items-start gap-2 text-sm', prueba.estado === 'ok' ? 'text-success' : 'text-danger')}>
          {prueba.estado === 'ok' ? <CheckCircle2 size={16} className="mt-px shrink-0" /> : <XCircle size={16} className="mt-px shrink-0" />}
          {prueba.texto}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmentos
          etiqueta="Formato"
          valor={modo}
          onChange={setModo}
          opciones={[
            { valor: 'html', texto: 'Como llega' },
            { valor: 'texto', texto: 'Solo texto' },
          ]}
        />
        {modo === 'html' && (
          <Segmentos
            etiqueta="Pantalla"
            valor={ancho}
            onChange={setAncho}
            opciones={[
              { valor: 'escritorio', texto: 'Escritorio', icono: <Monitor size={14} aria-hidden /> },
              { valor: 'celular', texto: 'Celular', icono: <Smartphone size={14} aria-hidden /> },
            ]}
          />
        )}
      </div>

      <p className="text-xs opacity-55">Vista previa con datos de ejemplo. Los enlaces y botones no se abren desde aquí.</p>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {!vista && !error && (
        <div role="status" aria-label="Armando la vista previa" className="flex flex-col gap-3 rounded-xl border border-black/10 p-6 dark:border-white/10">
          <Esqueleto className="mx-auto h-8 w-32" />
          <Esqueleto className="h-4 w-3/4" />
          <Esqueleto className="h-3.5 w-full" />
          <Esqueleto className="h-3.5 w-5/6" />
          <Esqueleto className="mx-auto mt-2 h-10 w-40 rounded-full" />
        </div>
      )}
      {vista &&
        (modo === 'html' ? (
          <div className="overflow-x-auto rounded-xl border border-black/10 bg-white p-2 dark:border-white/10">
            <iframe
              ref={iframe}
              title={`Vista previa: ${info.nombre}`}
              srcDoc={vista.html}
              // Sin scripts ni navegación: solo se dibuja. allow-same-origin permite medir su alto.
              sandbox="allow-same-origin"
              onLoad={medir}
              className="mx-auto block transition-[width] duration-200"
              style={{ width: ancho === 'celular' ? 375 : '100%', maxWidth: '100%', height: alto, border: 0 }}
            />
          </div>
        ) : (
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-xl border border-black/10 bg-black/[0.02] p-4 font-sans text-sm leading-relaxed dark:border-white/10 dark:bg-white/[0.03]">
            {`Asunto: ${vista.asunto}\n\n${vista.texto}`}
          </pre>
        ))}
    </GlassCard>
  );
}

function Segmentos<T extends string>({
  etiqueta,
  valor,
  onChange,
  opciones,
}: {
  etiqueta: string;
  valor: T;
  onChange: (v: T) => void;
  opciones: { valor: T; texto: string; icono?: React.ReactNode }[];
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.06]">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            o.valor === valor ? 'bg-[var(--glass-bg)] text-brand-600 shadow-sm dark:text-brand-400' : 'opacity-65 hover:opacity-100'
          )}
        >
          {o.icono}
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Elegir personas (con su rol del portal) y enviarles la bienvenida. */
function EnviarBienvenida() {
  const [q, setQ] = useState('');
  const [qBuscar, setQBuscar] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioConfig[]>([]);
  const [cargando, setCargando] = useState(true);
  const [elegidos, setElegidos] = useState<Map<string, UsuarioConfig>>(new Map());
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBienvenida[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useListo();
  const avisos = useAvisos();

  useEffect(() => {
    const t = setTimeout(() => setQBuscar(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    // Solo quien tiene algún rol del portal: sin rol no podría entrar.
    apiConfig
      .listarUsuarios({ q: qBuscar, page: 1, pageSize: 50, conRol: true })
      .then((r) => vivo && setUsuarios(r.data))
      .catch((e) => vivo && setError(mensaje(e, 'No se pudieron cargar los usuarios.')))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [qBuscar]);

  const alternar = (u: UsuarioConfig) =>
    setElegidos((m) => {
      const n = new Map(m);
      if (n.has(u.id)) n.delete(u.id);
      else n.set(u.id, u);
      return n;
    });

  const enviar = async () => {
    // Durante la palomita el botón sigue activo pero sin nadie elegido no hace nada.
    if (!elegidos.size) return;
    setEnviando(true);
    setError(null);
    setResultados(null);
    try {
      const { resultados: r } = await apiConfig.enviarBienvenida([...elegidos.keys()]);
      setResultados(r);
      const bien = r.filter((x) => x.enviado).length;
      if (bien) {
        setListo(true);
        avisos.ok(bien === 1 ? 'Bienvenida enviada a 1 persona.' : `Bienvenida enviada a ${bien} personas.`);
      }
      // Los que salieron bien ya no quedan marcados (así no se reenvían sin querer).
      setElegidos((m) => {
        const n = new Map(m);
        for (const x of r) if (x.enviado) n.delete(x.id);
        return n;
      });
    } catch (e) {
      setError(mensaje(e, 'No se pudo enviar la bienvenida.'));
    } finally {
      setEnviando(false);
    }
  };

  const enviados = resultados?.filter((r) => r.enviado).length ?? 0;

  return (
    <GlassCard className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Send size={17} className="text-brand-600 dark:text-brand-400" aria-hidden /> Enviar la bienvenida
        </h2>
        <p className="text-sm opacity-65">
          Elige a quién. Cada persona recibe lo que puede hacer según sus roles y el botón para entrar al portal. Queda en el Historial.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" aria-hidden />
        <Input placeholder="Buscar por nombre o usuario…" className="pl-9" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} aria-label="Buscar personas" />
      </div>

      {elegidos.size > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Personas elegidas">
          {[...elegidos.values()].map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => alternar(u)}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/12 px-3 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-500/20 dark:text-brand-300"
                title="Quitar"
              >
                {u.nombre} <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10">
        {cargando &&
          [0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="flex items-center gap-3 border-b border-black/5 px-3 py-3 last:border-0 dark:border-white/5">
              <Esqueleto className="size-4 rounded" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Esqueleto className={cn('h-3.5', i % 2 ? 'w-32' : 'w-44')} />
                <Esqueleto className="h-3 w-40" />
              </div>
            </div>
          ))}
        {!cargando && !usuarios.length && <p className="px-3 py-3 text-sm opacity-60">Nadie coincide con la búsqueda.</p>}
        {!cargando && (
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {usuarios.map((u) => {
              const marcado = elegidos.has(u.id);
              const sinCorreo = !u.email;
              const sinRol = !u.roles.length;
              const bloqueado = sinCorreo || sinRol || !u.activo;
              return (
                <li key={u.id}>
                  <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm', bloqueado ? 'cursor-not-allowed opacity-50' : 'hover:bg-brand-500/5')}>
                    <input type="checkbox" checked={marcado} disabled={bloqueado} onChange={() => alternar(u)} className="size-4" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.nombre}</span>
                      <span className="block truncate text-xs opacity-60">
                        {u.username}
                        {sinRol ? ' · sin rol' : ` · ${u.roles.map(nombreRol).join(' · ')}`}
                        {sinCorreo && ' · sin correo'}
                        {!u.activo && ' · deshabilitado'}
                      </span>
                    </span>
                    {marcado && <Check size={16} className="shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {resultados && (
        <div className="anim-aparecer flex flex-col gap-1.5 rounded-xl bg-black/[0.03] px-4 py-3 text-sm dark:bg-white/[0.05]">
          <p className="font-semibold">
            {enviados} de {resultados.length} {resultados.length === 1 ? 'bienvenida enviada' : 'bienvenidas enviadas'}
          </p>
          <ul className="flex flex-col gap-1">
            {resultados.map((r) => (
              <li key={r.id} className={cn('flex items-start gap-2', r.enviado ? 'text-success' : 'text-danger')}>
                {r.enviado ? <CheckCircle2 size={15} className="mt-px shrink-0" /> : <XCircle size={15} className="mt-px shrink-0" />}
                <span>
                  {r.nombre || r.username || r.id}
                  {r.motivo && <span className="opacity-80"> — {r.motivo}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={enviar} disabled={!elegidos.size && !listo} estado={enviando ? 'cargando' : listo ? 'listo' : null}>
          <Send size={15} />{' '}
          {enviando ? 'Enviando…' : listo && !elegidos.size ? 'Bienvenida enviada' : elegidos.size ? `Enviar bienvenida a ${elegidos.size} ${elegidos.size === 1 ? 'persona' : 'personas'}` : 'Elige a quién enviarla'}
        </Button>
      </div>
    </GlassCard>
  );
}

/** Correos mientras cargan: la lista a la izquierda y la vista previa a la derecha. */
function EsqueletoCorreos() {
  return (
    <div role="status" aria-label="Cargando" className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <GlassCard className="flex flex-col gap-3 !p-4">
        <Esqueleto className="h-3.5 w-3/4" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-1.5 py-1">
            <Esqueleto className={cn('h-3.5', i % 2 ? 'w-2/3' : 'w-4/5')} />
            <Esqueleto className="h-3 w-1/2" />
          </div>
        ))}
      </GlassCard>
      <GlassCard className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Esqueleto className="h-5 w-48" />
            <Esqueleto className="h-3.5 w-64 max-w-full" />
          </div>
          <Esqueleto className="h-9 w-40 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Esqueleto className="h-14 rounded-xl" />
          <Esqueleto className="h-14 rounded-xl" />
        </div>
        <Esqueleto className="h-80 rounded-xl" />
      </GlassCard>
    </div>
  );
}
