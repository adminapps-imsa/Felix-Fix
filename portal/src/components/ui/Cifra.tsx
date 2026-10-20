import { useContador } from '../../lib/useContador';
import { formatCantidad } from '../../lib/formatters';

/**
 * Un número que cuenta hasta su valor al aparecer o al cambiar (indicadores,
 * tarjetas). Los lectores de pantalla reciben el valor final, no la cuenta.
 */
export function Cifra({ valor, formato = formatCantidad, className }: { valor: number; formato?: (n: number) => string; className?: string }) {
  const mostrado = useContador(valor);
  const entero = Number.isInteger(valor);
  return (
    <span className={className} aria-label={formato(valor)}>
      <span aria-hidden>{formato(entero ? Math.round(mostrado) : mostrado)}</span>
    </span>
  );
}
