import { cn } from '../../lib/cn';

/**
 * Esqueletos de carga: la forma de lo que viene mientras llegan los datos (en
 * vez de un «Cargando…» suelto). Con un brillo que pasa; quieto con «reducir movimiento».
 */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={cn('esqueleto h-4', className)} />;
}

/** Filas de una lista o tabla que está cargando. */
export function EsqueletoFilas({ filas = 6, className }: { filas?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={cn('flex flex-col', className)}>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-black/5 px-4 py-3.5 last:border-0 dark:border-white/5">
          <Esqueleto className="h-4 w-20 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Esqueleto className={cn('h-3.5', i % 3 === 0 ? 'w-3/5' : i % 3 === 1 ? 'w-2/5' : 'w-1/2')} />
            <Esqueleto className="h-3 w-1/4" />
          </div>
          <Esqueleto className="hidden h-6 w-24 shrink-0 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** La página de detalle de un caso mientras carga: número, ruta y datos. */
export function EsqueletoDetalle() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
      <div className="glass-card flex flex-col items-center gap-3 p-8">
        <Esqueleto className="h-3 w-16" />
        <Esqueleto className="h-10 w-56" />
        <Esqueleto className="h-6 w-32 rounded-full" />
        <div className="mt-4 grid w-full max-w-3xl grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Esqueleto className="size-6 rounded-full" />
              <Esqueleto className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="glass-card grid gap-4 p-5 md:grid-cols-3">
        {[0, 1, 2].map((c) => (
          <div key={c} className="flex flex-col gap-3">
            <Esqueleto className="h-4 w-32" />
            {[0, 1, 2, 3].map((f) => (
              <Esqueleto key={f} className="h-3.5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Una pantalla cualquiera mientras carga su código (al cambiar de página por primera vez). */
export function EsqueletoPagina() {
  return (
    <div role="status" aria-label="Cargando" className="flex flex-col gap-6">
      <Esqueleto className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Esqueleto key={i} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="glass-card overflow-hidden">
        <EsqueletoFilas filas={5} />
      </div>
    </div>
  );
}
