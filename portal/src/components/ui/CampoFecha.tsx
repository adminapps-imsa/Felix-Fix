import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Fecha que se puede escribir (dd/mm/aaaa, las barras se ponen solas) o
 * elegir en un calendario. Reemplaza al <input type="date"> nativo, que en
 * cada navegador se escribe distinto y en algunos no deja escribir.
 *
 * `value` y `onChange` usan 'AAAA-MM-DD' (como el input nativo y la API);
 * '' = sin fecha. `min`/`max` en el mismo formato. Mientras lo escrito está
 * incompleto o fuera de rango, el campo queda inválido con un mensaje en
 * español (setCustomValidity), así el formulario no se envía.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const dos = (n: number) => String(n).padStart(2, '0');
const aIso = (y: number, m: number, d: number) => `${y}-${dos(m + 1)}-${dos(d)}`;
const aTexto = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const hoyIso = () => {
  const d = new Date();
  return aIso(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Lo escrito (dd/mm/aaaa, con o sin barras, año de 2 o 4 cifras) a 'AAAA-MM-DD', o null si no es una fecha real. */
export function leerFecha(texto: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(texto.trim()) || /^(\d{2})(\d{2})(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const f = new Date(Date.UTC(y, mes - 1, d));
  // 31/02 cambia de mes al construirla: no es una fecha real.
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return aIso(y, mes - 1, d);
}

/** Mientras se escribe: solo cifras y barras, y las barras se agregan solas (18102026 → 18/10/2026). */
export function enmascarar(nuevo: string, anterior: string) {
  // Si se está borrando, no se vuelve a poner la barra recién borrada.
  if (nuevo.length < anterior.length) return nuevo;
  // Una barra escrita justo después de la que se puso sola no se duplica (01/ + / → 01/).
  const partes = nuevo.replace(/[.-]/g, '/').replace(/\/{2,}/g, '/').split('/');
  if (partes.length > 3 || partes.some((p) => /\D/.test(p))) return anterior;
  if (partes.length === 1) {
    const c = partes[0].slice(0, 8);
    return [c.slice(0, 2), c.slice(2, 4), c.slice(4)].filter(Boolean).join('/') + (c.length === 2 || c.length === 4 ? '/' : '');
  }
  const [d, mes = '', anio = ''] = partes;
  const salida = [d.slice(0, 2), mes.slice(0, 2), anio.slice(0, 4)].slice(0, partes.length).join('/');
  // Día/mes ya escrito con barra y el mes completo: la segunda barra también va sola.
  return partes.length === 2 && mes.length >= 2 ? `${salida}/` : salida;
}

function motivoInvalida(texto: string, iso: string | null, { required, min, max }: { required?: boolean; min?: string; max?: string }) {
  if (!texto.trim()) return required ? 'Escribe o elige una fecha.' : '';
  if (!iso) return 'Escribe la fecha como dd/mm/aaaa, por ejemplo 18/10/2026.';
  if (min && iso < min) return `La fecha debe ser el ${aTexto(min)} o posterior.`;
  if (max && iso > max) return `La fecha no puede ser posterior al ${aTexto(max)}.`;
  return '';
}

export function CampoFecha({
  value,
  onChange,
  min,
  max,
  required,
  id,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const [texto, setTexto] = useState(aTexto(value));
  const [abierto, setAbierto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const envolturaRef = useRef<HTMLDivElement>(null);
  // Lo último que este campo avisó con onChange: así se distingue el eco propio de un cambio de afuera.
  const emitido = useRef(value);

  const emitir = (v: string) => {
    if (v === emitido.current) return;
    emitido.current = v;
    onChange(v);
  };

  // Si el valor cambia desde afuera (el Excel llenó la fecha, se limpió el filtro), se muestra.
  useEffect(() => {
    if (value === emitido.current) return;
    emitido.current = value;
    setTexto(aTexto(value));
  }, [value]);

  // Validez del campo con mensaje en español (el aviso global no pisa un mensaje propio).
  useEffect(() => {
    inputRef.current?.setCustomValidity(motivoInvalida(texto, leerFecha(texto), { required, min, max }));
  }, [texto, required, min, max]);

  const escribir = (nuevo: string) => {
    const t = enmascarar(nuevo, texto);
    setTexto(t);
    const iso = leerFecha(t);
    // Incompleta, imposible o fuera de rango cuenta como «sin fecha» (el formulario la pide).
    emitir(iso && !motivoInvalida(t, iso, { min, max }) ? iso : '');
  };

  const elegir = (iso: string) => {
    setTexto(aTexto(iso));
    emitir(iso);
    setAbierto(false);
    inputRef.current?.focus();
  };

  const invalida = Boolean(texto.trim()) && Boolean(motivoInvalida(texto, leerFecha(texto), { min, max }));

  return (
    <div ref={envolturaRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        aria-label={ariaLabel}
        aria-invalid={invalida || undefined}
        required={required}
        maxLength={10}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onBlur={() => {
          // Al salir del campo, lo escrito en otro formato (18-10-26) queda como dd/mm/aaaa.
          const iso = leerFecha(texto);
          if (iso) setTexto(aTexto(iso));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
        className={cn(
          'w-full rounded-xl border border-black/10 bg-white/70 py-2 pr-10 pl-3 text-sm tabular-nums outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-current placeholder:opacity-45 hover:border-black/20 focus:border-brand-500/60 focus:bg-white focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:focus:bg-white/[0.07]',
          invalida && 'border-danger/60 focus:border-danger/60 focus:ring-danger/15'
        )}
      />
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-label="Abrir calendario"
        aria-expanded={abierto}
        aria-haspopup="dialog"
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-xl opacity-60 transition-opacity hover:opacity-100"
      >
        <CalendarDays size={17} aria-hidden />
      </button>
      {abierto && (
        <Calendario
          ancla={envolturaRef}
          valor={leerFecha(texto) ?? value}
          min={min}
          max={max}
          onElegir={elegir}
          onCerrar={() => {
            setAbierto(false);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function Calendario({
  ancla,
  valor,
  min,
  max,
  onElegir,
  onCerrar,
}: {
  ancla: React.RefObject<HTMLDivElement | null>;
  valor: string;
  min?: string;
  max?: string;
  onElegir: (iso: string) => void;
  onCerrar: () => void;
}) {
  const hoy = hoyIso();
  const inicial = valor || (max && hoy > max ? max : min && hoy < min ? min : hoy);
  const [foco, setFoco] = useState(inicial);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titulo = useId();
  const y = Number(foco.slice(0, 4));
  const m = Number(foco.slice(5, 7)) - 1;

  // Va en un portal con posición fija (los modales tienen scroll y lo cortarían): debajo del campo, o arriba si no cabe.
  const ubicar = useCallback(() => {
    const r = ancla.current?.getBoundingClientRect();
    const alto = panelRef.current?.offsetHeight ?? 340;
    const ancho = panelRef.current?.offsetWidth ?? 296;
    if (!r) return;
    const abajo = r.bottom + 6 + alto <= window.innerHeight;
    setPos({
      top: abajo ? r.bottom + 6 : Math.max(8, r.top - 6 - alto),
      left: Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8),
    });
  }, [ancla]);
  useLayoutEffect(() => {
    ubicar();
    window.addEventListener('resize', ubicar);
    window.addEventListener('scroll', ubicar, true);
    return () => {
      window.removeEventListener('resize', ubicar);
      window.removeEventListener('scroll', ubicar, true);
    };
  }, [ubicar]);

  // El día con foco recibe el foco del teclado.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus();
  }, [foco, pos]);

  // Clic fuera: se cierra (el campo y su botón no cuentan como «fuera»).
  useEffect(() => {
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !ancla.current?.contains(t)) onCerrar();
    };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  }, [ancla, onCerrar]);

  const fueraDeRango = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const mover = (dias: number) => {
    const f = new Date(Date.UTC(y, m, Number(foco.slice(8, 10)) + dias));
    setFoco(aIso(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
  };
  const cambiarMes = (delta: number) => {
    const ultimo = new Date(Date.UTC(y, m + delta + 1, 0)).getUTCDate();
    const f = new Date(Date.UTC(y, m + delta, Math.min(Number(foco.slice(8, 10)), ultimo)));
    setFoco(aIso(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
  };

  const tecla = (e: React.KeyboardEvent) => {
    const acciones: Record<string, () => void> = {
      ArrowLeft: () => mover(-1),
      ArrowRight: () => mover(1),
      ArrowUp: () => mover(-7),
      ArrowDown: () => mover(7),
      PageUp: () => cambiarMes(-1),
      PageDown: () => cambiarMes(1),
      Home: () => mover(-((new Date(Date.UTC(y, m, Number(foco.slice(8, 10)))).getUTCDay() + 6) % 7)),
      End: () => mover(6 - ((new Date(Date.UTC(y, m, Number(foco.slice(8, 10)))).getUTCDay() + 6) % 7)),
      Escape: onCerrar,
    };
    const accion = acciones[e.key];
    if (!accion) return;
    // preventDefault: el modal de atrás no se cierra con este Escape.
    e.preventDefault();
    e.stopPropagation();
    accion();
  };

  // Celdas del mes: empieza en lunes; los huecos del inicio quedan vacíos.
  const primero = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const celdas: (string | null)[] = [...Array(primero).fill(null), ...Array.from({ length: diasMes }, (_, i) => aIso(y, m, i + 1))];
  while (celdas.length % 7) celdas.push(null);
  const semanas = Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
  const puedeAtras = !min || aIso(y, m, 1) > min;
  const puedeAdelante = !max || aIso(y, m, diasMes) < max;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titulo}
      onKeyDown={tecla}
      // Los clics dentro del calendario no llegan al modal de atrás (React propaga por el árbol, no por el DOM).
      onClick={(e) => e.stopPropagation()}
      className="anim-menu fixed z-[200] origin-top-left w-[18.5rem] rounded-2xl border border-black/5 bg-[var(--glass-bg)] p-3 text-sm shadow-[var(--shadow-elevada)] dark:border-white/10"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => cambiarMes(-1)} disabled={!puedeAtras} aria-label="Mes anterior" className="grid size-8 place-items-center rounded-full hover:bg-brand-500/10 disabled:opacity-30">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span id={titulo} className="font-semibold capitalize" aria-live="polite">
          {MESES[m]} {y}
        </span>
        <button type="button" onClick={() => cambiarMes(1)} disabled={!puedeAdelante} aria-label="Mes siguiente" className="grid size-8 place-items-center rounded-full hover:bg-brand-500/10 disabled:opacity-30">
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <table role="grid" className="w-full table-fixed border-separate border-spacing-0.5">
        {/* bg-none: sin la franja que el portal pone a los encabezados de las tablas de listado. */}
        <thead className="!bg-none">
          <tr>
            {DIAS.map((d, i) => (
              <th key={i} scope="col" abbr={DIAS_LARGOS[i]} className="pb-1 text-center text-xs font-semibold opacity-50">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((s, i) => (
            <tr key={i}>
              {s.map((iso, j) =>
                iso ? (
                  <td key={iso} className="p-0">
                    <button
                      type="button"
                      data-dia={iso}
                      tabIndex={iso === foco ? 0 : -1}
                      disabled={fueraDeRango(iso)}
                      aria-pressed={iso === valor}
                      aria-label={`${Number(iso.slice(8, 10))} de ${MESES[m]} de ${y}${iso === hoy ? ', hoy' : ''}`}
                      onClick={() => onElegir(iso)}
                      onFocus={() => setFoco(iso)}
                      className={cn(
                        'grid h-9 w-full place-items-center rounded-lg tabular-nums outline-none transition-colors',
                        'hover:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-25',
                        iso === hoy && 'font-bold text-brand-600 dark:text-brand-400',
                        iso === valor && '!bg-brand-500 !text-white dark:!bg-brand-400 dark:!text-slate-950'
                      )}
                    >
                      {Number(iso.slice(8, 10))}
                    </button>
                  </td>
                ) : (
                  <td key={`v${i}-${j}`} />
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-between border-t border-black/5 pt-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => onElegir(hoy)}
          disabled={fueraDeRango(hoy)}
          className="rounded-full px-3 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-500/10 disabled:opacity-30 dark:text-brand-400"
        >
          Hoy
        </button>
        <button type="button" onClick={onCerrar} className="rounded-full px-3 py-1 text-xs font-semibold opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10">
          Cerrar
        </button>
      </div>
    </div>,
    document.body
  );
}
