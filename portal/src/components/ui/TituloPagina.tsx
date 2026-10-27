import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { TelaBandera } from '../../lib/fiestasPatrias';

/**
 * Título de un módulo con su icono en el cuadro del logo. Va dentro de una
 * <BandaPagina>, así que se pinta en blanco sobre la franja de color.
 */
export function TituloPagina({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        aria-hidden
        className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_20px_-8px_rgba(15,10,60,0.5)] ring-1 ring-white/25 backdrop-blur-sm"
      >
        <Icono size={22} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <h1 className="titulo-pagina text-white">{titulo}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Franja de color de borde a borde detrás del encabezado de la página. Es
 * decorativa y absoluta: la distribución de la página no cambia.
 * `solape`: la franja sigue por debajo del encabezado para que la fila
 * siguiente (los indicadores) quede montada sobre su borde.
 * `panama`: en las fiestas patrias la banda es la bandera de Panamá, como tela colgada.
 * `detalle`: en las pantallas de detalle la franja va detrás del enlace de
 * regreso y la tarjeta principal queda montada sobre su borde.
 */
export function BandaPagina({
  solape = false,
  detalle = false,
  panama = false,
  className,
  children,
}: {
  solape?: boolean;
  detalle?: boolean;
  panama?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('en-banda relative', panama && 'en-banda--panama', className)}>
      <div aria-hidden className={cn('banda-pagina', detalle ? 'banda-pagina--detalle' : solape ? 'banda-pagina--solape' : 'banda-pagina--corta', panama && 'banda-panama')}>
        {panama && <TelaBandera />}
      </div>
      {children}
    </div>
  );
}
