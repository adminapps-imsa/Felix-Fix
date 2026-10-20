import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * Pocas opciones fijas (p. ej. la división: Perfumería o Cosméticos) como
 * botones que se tocan, en vez de un campo para escribir. Es un grupo de
 * radios nativos: funciona con teclado y `required` lo valida el formulario.
 * Cada opción ya es un <label>: va dentro de `<Field grupo>`, no de un Field
 * normal (labels anidados). `etiquetaId` nombra el radiogroup.
 * `error`: el catálogo no se pudo cargar; se muestra con «Reintentar».
 */
export function SelectorOpciones({
  value,
  onChange,
  opciones,
  required,
  name,
  etiquetaId,
  error,
  onReintentar,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: string[];
  required?: boolean;
  name?: string;
  etiquetaId?: string;
  error?: string | null;
  onReintentar?: () => void;
}) {
  const grupo = useId();
  if (error && !opciones.length) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-danger">
        {error}
        {onReintentar && (
          <button type="button" onClick={onReintentar} className="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-danger/30 hover:bg-danger/10">
            Reintentar
          </button>
        )}
      </p>
    );
  }
  if (!opciones.length) return <p className="text-sm opacity-60">Cargando opciones…</p>;
  return (
    <div role="radiogroup" aria-labelledby={etiquetaId} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activa = o === value;
        return (
          <label
            key={o}
            className={cn(
              'relative inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-500',
              activa
                ? 'border-brand-500 bg-brand-500 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-slate-950'
                : 'border-black/10 hover:border-brand-500/50 hover:bg-brand-500/5 dark:border-white/15'
            )}
          >
            <input
              type="radio"
              name={name || grupo}
              value={o}
              checked={activa}
              required={required}
              onChange={() => onChange(o)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {activa && <Check size={15} aria-hidden />}
            {o}
          </label>
        );
      })}
    </div>
  );
}
