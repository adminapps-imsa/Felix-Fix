import { useMemo, useState } from 'react';
import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { cn } from '../../../lib/cn';
import type { Reclamo, ReclamoLinea, TipoReclamo } from '../../../types/reclamo';
import { TIPOS, TIPO_LABEL, TIPOS_AUTO_APROBADOS } from '../lib/tipos';

// Quien creó el reclamo devuelto corrige sus productos: código, descripción,
// cantidad y motivo; agrega y quita. El backend compara con lo guardado
// (src/domain/reclamo.js: planCorreccionLineas): los que no cambian
// conservan la decisión de la compradora, los cambiados y los nuevos vuelven
// a decidirse (o se aprueban solos si su motivo es automático).

interface Fila {
  /** Clave local de la fila (las nuevas no tienen LineaId). */
  clave: string;
  lineaId: number | null;
  codigoBarra: string;
  descripcion: string;
  cantidad: string;
  tipo: TipoReclamo;
  quitada: boolean;
}

const aFila = (l: ReclamoLinea): Fila => ({
  clave: `l${l.LineaId}`,
  lineaId: l.LineaId,
  codigoBarra: l.CodigoBarra,
  // Lo guardado del Excel; si no hay, la de SAP que se ve en el detalle.
  descripcion: l.DescripcionExcel ?? l.Descripcion ?? '',
  cantidad: l.Cantidad === null ? '' : String(l.Cantidad),
  tipo: l.Tipo,
  quitada: false,
});

const DECISION_LABEL = { pendiente: 'Por decidir', aprobado: 'Aprobado', rechazado: 'Rechazado' } as const;

export function CorregirProductosModal({
  reclamo,
  lineas,
  onClose,
  onGuardado,
}: {
  reclamo: Reclamo;
  lineas: ReclamoLinea[];
  onClose: () => void;
  onGuardado: (r: Reclamo) => void;
}) {
  const originales = useMemo(() => new Map(lineas.map((l) => [l.LineaId, l])), [lineas]);
  const [filas, setFilas] = useState<Fila[]>(() => [...lineas].sort((a, b) => a.Posicion - b.Posicion).map(aFila));
  const [busqueda, setBusqueda] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();
  const [nuevas, setNuevas] = useState(0);

  const cambiada = (f: Fila) => {
    if (f.lineaId === null) return false;
    const o = originales.get(f.lineaId);
    if (!o) return false;
    const cant = f.cantidad.trim() === '' ? null : Number(f.cantidad);
    return (
      o.CodigoBarra.trim() !== f.codigoBarra.trim() ||
      (o.DescripcionExcel ?? o.Descripcion ?? '').trim() !== f.descripcion.trim() ||
      (o.Cantidad === null ? null : Number(o.Cantidad)) !== cant ||
      o.Tipo !== f.tipo
    );
  };

  const set = (clave: string, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)));
  const agregar = () => {
    setNuevas((n) => n + 1);
    setBusqueda('');
    setFilas((fs) => [
      ...fs,
      { clave: `n${nuevas}`, lineaId: null, codigoBarra: '', descripcion: '', cantidad: '', tipo: reclamo.Tipo, quitada: false },
    ]);
  };
  const quitar = (f: Fila) => (f.lineaId === null ? setFilas((fs) => fs.filter((x) => x.clave !== f.clave)) : set(f.clave, { quitada: !f.quitada }));

  const vigentes = filas.filter((f) => !f.quitada);
  const resumen = {
    cambiados: vigentes.filter(cambiada).length,
    nuevos: vigentes.filter((f) => f.lineaId === null).length,
    quitados: filas.filter((f) => f.quitada).length,
  };
  const hayCambios = resumen.cambiados + resumen.nuevos + resumen.quitados > 0;

  const q = busqueda.trim().toLowerCase();
  const visibles = q ? filas.filter((f) => f.lineaId === null || f.codigoBarra.toLowerCase().includes(q) || f.descripcion.toLowerCase().includes(q)) : filas;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vigentes.length) return setError('El reclamo debe tener al menos un producto.');
    const sinCodigo = vigentes.find((f) => !f.codigoBarra.trim());
    if (sinCodigo) return setError('Cada producto necesita su código de barra.');
    const cantidadMala = vigentes.find((f) => f.cantidad.trim() !== '' && !(Number(f.cantidad) >= 0));
    if (cantidadMala) return setError(`La cantidad «${cantidadMala.cantidad}» no es válida.`);
    setBusy(true);
    try {
      const r = await apiReclamos.corregirLineasReclamo(
        reclamo.Token,
        vigentes.map((f) => ({
          lineaId: f.lineaId,
          codigoBarra: f.codigoBarra.trim(),
          descripcion: f.descripcion.trim(),
          cantidad: f.cantidad.trim() === '' ? null : Number(f.cantidad),
          tipo: f.tipo,
        }))
      );
      avisos.ok(`Productos de ${reclamo.Numero} corregidos.`);
      onGuardado(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los productos.');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Corregir productos de ${reclamo.Numero}`} onClose={onClose} wide dismissible={!hayCambios}>
      <form onSubmit={guardar} className="flex flex-col gap-4 text-sm">
        <p className="opacity-75">
          Cambia el código, la descripción, la cantidad o el motivo; agrega o quita productos. Los que no toques conservan la decisión de la
          compradora; los que cambies y los nuevos vuelven a quedar <strong>por decidir</strong> (los de motivo automático se aprueban solos).
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" aria-hidden />
            <Input aria-label="Buscar producto" placeholder="Buscar código o descripción" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-9" />
          </label>
          <Button type="button" variant="secondary" onClick={agregar}>
            <Plus size={15} /> Agregar producto
          </Button>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white/95 text-xs uppercase tracking-wide opacity-80 dark:bg-slate-900/95">
              <tr>
                <th className="px-3 py-2 font-semibold">Código de barra</th>
                <th className="px-3 py-2 font-semibold">Descripción</th>
                <th className="w-28 px-3 py-2 font-semibold">Cantidad</th>
                <th className="w-52 px-3 py-2 font-semibold">Motivo</th>
                <th className="w-32 px-3 py-2 font-semibold">Decisión</th>
                <th className="w-12 px-2 py-2" aria-label="Quitar" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const o = f.lineaId !== null ? originales.get(f.lineaId) : undefined;
                const cambio = cambiada(f);
                const auto = TIPOS_AUTO_APROBADOS.has(f.tipo);
                return (
                  <tr key={f.clave} className={cn('border-t border-black/5 align-top dark:border-white/5', f.quitada && 'opacity-45', f.lineaId === null && 'bg-brand-500/[0.06]')}>
                    <td className="px-3 py-2">
                      <Input
                        aria-label="Código de barra"
                        required={!f.quitada}
                        disabled={f.quitada}
                        maxLength={50}
                        value={f.codigoBarra}
                        onChange={(e) => set(f.clave, { codigoBarra: e.target.value })}
                        className="font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input aria-label="Descripción" disabled={f.quitada} maxLength={300} value={f.descripcion} onChange={(e) => set(f.clave, { descripcion: e.target.value })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label="Cantidad"
                        inputMode="decimal"
                        disabled={f.quitada}
                        value={f.cantidad}
                        onChange={(e) => set(f.clave, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select aria-label="Motivo" disabled={f.quitada} value={f.tipo} onChange={(e) => set(f.clave, { tipo: e.target.value as TipoReclamo })}>
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>
                            {TIPO_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2 pt-4 text-xs">
                      {f.quitada ? (
                        <span className="font-semibold text-danger">Se quita</span>
                      ) : f.lineaId === null ? (
                        <span className="font-semibold text-brand-600 dark:text-brand-400">Nuevo · {auto ? 'automático' : 'por decidir'}</span>
                      ) : cambio ? (
                        <span className="font-semibold text-warning">Cambiado · {auto ? 'automático' : 'por decidir'}</span>
                      ) : (
                        <span className="opacity-70">{o ? DECISION_LABEL[o.DecStatus] : ''}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2"
                        aria-label={f.quitada ? 'Volver a incluir' : 'Quitar producto'}
                        title={f.quitada ? 'Volver a incluir' : 'Quitar producto'}
                        onClick={() => quitar(f)}
                      >
                        {f.quitada ? <RotateCcw size={15} /> : <Trash2 size={15} className="text-danger" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!visibles.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center opacity-60">
                    Ningún producto coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs opacity-70">
          {vigentes.length} producto(s) · {resumen.cambiados} cambiado(s) · {resumen.nuevos} nuevo(s) · {resumen.quitados} por quitar
        </p>
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!hayCambios} estado={busy ? 'cargando' : null}>
            {busy ? 'Guardando…' : 'Guardar productos'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
