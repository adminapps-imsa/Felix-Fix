import { Select } from '../../../components/ui/Input';
import type { Tienda } from '../../../types/productoDanado';

/**
 * Sucursal de un reclamo de Tienda: se elige del catálogo (antes era texto
 * libre y quedaban «COSTA DEL ESTE», «ALTAPLAZA»… que no coincidían con la
 * tienda). Si el valor no está en la lista (p. ej. venía así en el Excel), la
 * lista queda vacía y se muestra lo que venía para elegir la correcta.
 */
export function SelectSucursal({
  value,
  onChange,
  tiendas,
  fija = false,
}: {
  value: string;
  onChange: (nombre: string) => void;
  tiendas: Tienda[];
  /** Usuario en una tienda: la suya, sin poder cambiarla. */
  fija?: boolean;
}) {
  const enLista = tiendas.some((t) => t.Nombre === value);
  return (
    <>
      <Select
        required
        value={enLista ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={fija}
        title={fija ? 'Tu usuario está en esta tienda' : undefined}
      >
        <option value="" disabled>
          Elige la tienda…
        </option>
        {tiendas.map((t) => (
          <option key={t.TiendaId} value={t.Nombre}>
            {t.Nombre}
          </option>
        ))}
      </Select>
      {value.trim() && !enLista && tiendas.length > 0 && (
        <span className="text-xs text-warning">Venía «{value.trim()}», que no es una tienda de la lista: elige la correcta.</span>
      )}
    </>
  );
}
