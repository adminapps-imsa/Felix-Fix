import { cn } from './cn';

export interface Fiesta {
  /** Mes-día, p. ej. '11-03'. */
  dia: string;
  titulo: string;
  detalle: string;
}

/** Fechas con temática de Panamá (bandera, franja y saludo en Inicio). Para agregar una, se suma aquí. */
const FIESTAS: Fiesta[] = [
  { dia: '11-03', titulo: '¡Feliz Día de la Separación de Panamá!', detalle: '3 de noviembre de 1903. ¡Felices fiestas patrias!' },
  { dia: '11-04', titulo: '¡Feliz Día de los Símbolos Patrios!', detalle: 'La bandera, el escudo y el himno: orgullo panameño.' },
  { dia: '11-05', titulo: '¡Feliz Día de Colón!', detalle: 'El 5 de noviembre de 1903 Colón consolidó la separación.' },
];

/** Fecha de hoy en Panamá, como 'YYYY-MM-DD' (no la del equipo, que puede tener otra zona). */
export function hoyPanama(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
}

/** La fiesta de hoy, o null. La ven todos; pasado el día desaparece sola. */
export function useFiestaPatria(): Fiesta | null {
  return FIESTAS.find((f) => f.dia === hoyPanama().slice(5)) ?? null;
}

/** Bandera de Panamá: cuartel blanco con estrella azul, rojo, azul y blanco con estrella roja. */
export function BanderaPanama({ className, ondear }: { className?: string; ondear?: boolean }) {
  const estrella = 'M0,-1 L0.2245,-0.309 L0.951,-0.309 L0.3633,0.118 L0.5878,0.809 L0,0.382 L-0.5878,0.809 L-0.3633,0.118 L-0.951,-0.309 L-0.2245,-0.309 Z';
  return (
    <svg viewBox="0 0 30 20" role="img" aria-label="Bandera de Panamá" className={cn('shrink-0 overflow-hidden rounded-[3px] shadow-sm ring-1 ring-black/10', ondear && 'anim-ondear', className)}>
      <rect width="30" height="20" fill="#fff" />
      <rect x="15" width="15" height="10" fill="#d21034" />
      <rect y="10" width="15" height="10" fill="#005293" />
      <path d={estrella} transform="translate(7.5 5) scale(3.2)" fill="#005293" />
      <path d={estrella} transform="translate(22.5 15) scale(3.2)" fill="#d21034" />
    </svg>
  );
}

/** Franja rojo-blanco-azul al pie del encabezado. */
export function FranjaTricolor() {
  return <div aria-hidden className="franja-tricolor h-[3px]" />;
}
