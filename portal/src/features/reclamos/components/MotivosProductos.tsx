import type { ReclamoLinea, TipoReclamo } from '../../../types/reclamo';
import { cn } from '../../../lib/cn';
import { TIPO_LABEL_CORTO, TIPOS_AUTO_APROBADOS, ordenTipo } from '../lib/tipos';

type Grupo = { tipo: TipoReclamo; cantidad: number; pendientes: number; aprobados: number; rechazados: number };

/** Cuenta los productos por motivo, primero los que requieren decisión manual. */
export function agruparMotivos(lineas: Pick<ReclamoLinea, 'Tipo' | 'DecStatus'>[]): Grupo[] {
  const grupos = new Map<TipoReclamo, Grupo>();
  for (const l of lineas) {
    const g = grupos.get(l.Tipo) ?? { tipo: l.Tipo, cantidad: 0, pendientes: 0, aprobados: 0, rechazados: 0 };
    g.cantidad += 1;
    if (l.DecStatus === 'pendiente') g.pendientes += 1;
    else if (l.DecStatus === 'aprobado') g.aprobados += 1;
    else g.rechazados += 1;
    grupos.set(l.Tipo, g);
  }
  return [...grupos.values()].sort((a, b) => ordenTipo(a.tipo) - ordenTipo(b.tipo));
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Qué pasa con ese grupo: lo que falta decidir, o cómo quedó. */
function estadoGrupo(g: Grupo): { texto: string; tono: 'pendiente' | 'ok' | 'mal' | 'neutro' } {
  if (g.pendientes) return { texto: `${g.pendientes} por decidir`, tono: 'pendiente' };
  if (TIPOS_AUTO_APROBADOS.has(g.tipo) && !g.rechazados) return { texto: 'se aprueban solos', tono: 'neutro' };
  if (!g.rechazados) return { texto: g.cantidad === 1 ? 'aprobado' : 'aprobados', tono: 'ok' };
  if (!g.aprobados) return { texto: g.cantidad === 1 ? 'rechazado' : 'rechazados', tono: 'mal' };
  return { texto: `${g.aprobados} aprobado${g.aprobados === 1 ? '' : 's'} · ${g.rechazados} rechazado${g.rechazados === 1 ? '' : 's'}`, tono: 'neutro' };
}

const TONO: Record<ReturnType<typeof estadoGrupo>['tono'], string> = {
  pendiente: 'border-warning/30 bg-warning/10',
  ok: 'border-success/30 bg-success/10',
  mal: 'border-danger/30 bg-danger/10',
  neutro: 'border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.05]',
};

const TONO_TEXTO: Record<ReturnType<typeof estadoGrupo>['tono'], string> = {
  pendiente: 'text-warning',
  ok: 'text-success',
  mal: 'text-danger',
  neutro: 'opacity-60',
};

/**
 * Motivos de los productos del reclamo: el «Tipo» es uno solo, pero un
 * reclamo de faltante real puede traer también sobrantes o devoluciones que
 * la compradora sí tiene que decidir. Aquí se ve cada motivo con su cantidad.
 */
export function MotivosProductos({ lineas }: { lineas: Pick<ReclamoLinea, 'Tipo' | 'DecStatus'>[] }) {
  const grupos = agruparMotivos(lineas);
  if (!grupos.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="etiqueta">
        Motivos de los productos
        {grupos.length > 1 && <span className="ml-1 font-normal normal-case opacity-70">· este reclamo mezcla {grupos.length} motivos</span>}
      </span>
      <ul className="flex flex-wrap gap-2">
        {grupos.map((g) => {
          const e = estadoGrupo(g);
          return (
            <li key={g.tipo} className={cn('flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 text-sm', TONO[e.tono])}>
              <span className="font-semibold">{TIPO_LABEL_CORTO[g.tipo]}</span>
              <span className="opacity-70">· {plural(g.cantidad, 'producto', 'productos')}</span>
              <span className={cn('text-xs font-medium', TONO_TEXTO[e.tono])}>— {e.texto}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
