import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Field, Input } from '../../../components/ui/Input';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import type { ArticuloData, ReclamoLinea } from '../../../types/reclamo';

/**
 * La compradora aprueba un sobrante no esperado que no está en SAP: llena los
 * datos del artículo, que le llegan a Data (junto con lo de la hoja del
 * Excel) cuando ella cierra el reclamo.
 */
export function ArticuloDataModal({
  token,
  linea: l,
  marcaReclamo,
  comentario,
  onClose,
  onAprobado,
}: {
  token: string;
  linea: ReclamoLinea;
  /** Marca del reclamo: se propone para el artículo. */
  marcaReclamo?: string | null;
  comentario: string;
  onClose: () => void;
  onAprobado: (linea: ReclamoLinea) => void;
}) {
  const [campos, setCampos] = useState({
    descripcion: l.ArtDescripcion ?? '',
    marca: l.ArtMarca ?? marcaReclamo ?? '',
    categoria: l.ArtCategoria ?? '',
    tipoProducto: l.ArtTipoProducto ?? '',
    cicloVida: l.ArtCicloVida ?? '',
    costo: l.ArtCosto === null || l.ArtCosto === undefined ? '' : String(l.ArtCosto),
    precioVenta: l.ArtPrecioVenta === null || l.ArtPrecioVenta === undefined ? '' : String(l.ArtPrecioVenta),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof campos, v: string) => setCampos((c) => ({ ...c, [k]: v }));
  const excel = [l.Referencia, l.Color, l.Talla].filter(Boolean).join(' · ') || l.DescripcionExcel || l.Descripcion || `Producto ${l.Posicion}`;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const numero = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
    const costo = numero(campos.costo);
    const precioVenta = numero(campos.precioVenta);
    if (!(costo >= 0)) return setError('El costo debe ser un número (0 o más).');
    if (!(precioVenta >= 0)) return setError('El precio de venta debe ser un número (0 o más).');
    const articulo: ArticuloData = {
      costo,
      precioVenta,
      categoria: campos.categoria.trim(),
      tipoProducto: campos.tipoProducto.trim(),
      cicloVida: campos.cicloVida.trim(),
      descripcion: campos.descripcion.trim(),
      marca: campos.marca.trim(),
    };
    setBusy(true);
    try {
      onAprobado(await apiReclamos.decidirLinea(token, l.Posicion, 'aprobado', comentario, articulo));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo aprobar el producto.');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Aprobar sobrante no esperado #${l.Posicion}`} onClose={onClose} dismissible={!busy}>
      <form onSubmit={guardar} className="flex flex-col gap-4 text-sm">
        <p className="opacity-75">
          <strong className="font-semibold">{excel}</strong>
          {l.Cantidad !== null && ` · ${l.Cantidad} unidad${Number(l.Cantidad) === 1 ? '' : 'es'}`}. No está creado en SAP: estos datos le llegan a Data, con lo del
          Excel, para que cree el artículo cuando cierres el reclamo.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Descripción" className="sm:col-span-2">
            <Input required maxLength={300} value={campos.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
          </Field>
          <Field label="Marca">
            <Input required maxLength={100} value={campos.marca} onChange={(e) => set('marca', e.target.value)} />
          </Field>
          <Field label="Categoría">
            <Input required maxLength={100} value={campos.categoria} onChange={(e) => set('categoria', e.target.value)} />
          </Field>
          <Field label="Tipo de producto">
            <Input required maxLength={100} value={campos.tipoProducto} onChange={(e) => set('tipoProducto', e.target.value)} />
          </Field>
          <Field label="Ciclo de vida">
            <Input required maxLength={100} value={campos.cicloVida} onChange={(e) => set('cicloVida', e.target.value)} />
          </Field>
          <Field label="Costo (USD)">
            <Input required inputMode="decimal" value={campos.costo} onChange={(e) => set('costo', e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Precio de venta (USD)">
            <Input required inputMode="decimal" value={campos.precioVenta} onChange={(e) => set('precioVenta', e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" estado={busy ? 'cargando' : null}>
            <Check size={15} /> Aprobar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
