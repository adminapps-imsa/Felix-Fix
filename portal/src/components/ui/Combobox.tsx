import React, { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Input } from './Input';

const MAX_VISIBLES = 50;

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();

/**
 * Campo de texto con lista desplegable filtrada: se elige una opción o se
 * escribe un valor nuevo. Pensado para catálogos largos (más de mil marcas):
 * filtra en memoria y dibuja como máximo MAX_VISIBLES filas.
 *
 * `sugeridas` van primero (p. ej. las marcas del proveedor elegido).
 * `nuevoLabel` muestra la fila "Agregar «texto»" cuando lo escrito no existe,
 * para dejar claro que ese valor se guardará en el catálogo.
 */
export function Combobox({
  value,
  onChange,
  opciones,
  sugeridas = [],
  nuevoLabel,
  placeholder,
  required,
  maxLength,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  sugeridas?: string[];
  nuevoLabel?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const listaId = useId();
  const listaRef = useRef<HTMLUListElement>(null);

  const indice = useMemo(() => {
    const vistos = new Set<string>();
    const todas: { valor: string; norm: string; sugerida: boolean }[] = [];
    for (const [lista, sugerida] of [
      [sugeridas, true],
      [opciones, false],
    ] as const) {
      for (const valor of lista) {
        const norm = normalizar(valor);
        if (vistos.has(norm)) continue;
        vistos.add(norm);
        todas.push({ valor, norm, sugerida });
      }
    }
    return todas;
  }, [opciones, sugeridas]);

  const buscado = normalizar(value);
  const filtradas = useMemo(() => {
    const out = [];
    for (const o of indice) {
      if (!buscado || o.norm.includes(buscado)) out.push(o);
      if (out.length >= MAX_VISIBLES) break;
    }
    return out;
  }, [indice, buscado]);
  const existe = !buscado || indice.some((o) => o.norm === buscado);
  const mostrarNuevo = Boolean(nuevoLabel) && !existe;
  const total = filtradas.length + (mostrarNuevo ? 1 : 0);

  const elegir = (v: string) => {
    onChange(v);
    setAbierto(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) return setAbierto(true);
      const sig = e.key === 'ArrowDown' ? Math.min(activo + 1, total - 1) : Math.max(activo - 1, 0);
      setActivo(sig);
      listaRef.current?.children[sig]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && abierto && total > 0) {
      e.preventDefault(); // no enviar el formulario al elegir con Enter
      if (activo < filtradas.length) elegir(filtradas[activo].valor);
      else elegir(value.trim());
    } else if (e.key === 'Escape' && abierto) {
      e.stopPropagation();
      setAbierto(false);
    }
  };

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoComplete="off"
        className="pr-8"
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setActivo(0);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onKeyDown={onKeyDown}
      />
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50" />
      {abierto && total > 0 && (
        <ul
          id={listaId}
          ref={listaRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-black/10 bg-white py-1 text-sm shadow-lg dark:border-white/10 dark:bg-slate-900"
          // mousedown antes que blur: si no, el input se cierra antes de registrar el clic.
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtradas.map((o, i) => (
            <li
              key={o.valor}
              role="option"
              aria-selected={i === activo}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5',
                i === activo && 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
              )}
              onMouseEnter={() => setActivo(i)}
              onClick={() => elegir(o.valor)}
            >
              <span className="truncate">{o.valor}</span>
              {o.sugerida && <span className="shrink-0 text-[11px] font-semibold opacity-60">del proveedor</span>}
            </li>
          ))}
          {mostrarNuevo && (
            <li
              role="option"
              aria-selected={activo === filtradas.length}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 border-t border-black/5 px-3 py-1.5 font-semibold text-brand-600 dark:border-white/10 dark:text-brand-400',
                activo === filtradas.length && 'bg-brand-500/10'
              )}
              onMouseEnter={() => setActivo(filtradas.length)}
              onClick={() => elegir(value.trim())}
            >
              <Plus size={14} />
              {nuevoLabel} «{value.trim()}»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
