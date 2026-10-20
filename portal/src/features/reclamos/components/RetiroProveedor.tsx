import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ImagePlus, Truck, X } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Input';
import { CampoFecha } from '../../../components/ui/CampoFecha';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { comprimirImagen } from '../../../lib/comprimirImagen';
import { formatFecha } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';
import type { Reclamo } from '../../../types/reclamo';
import { formatFechaCorta } from '../lib/tipos';
import { AuthImage } from './AuthImage';
import { ConfirmModal } from './ConfirmModal';

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Reclamos de devolución: Gof marca que el proveedor ya retiró el producto,
 * con la foto y el día. Solo deja constancia; el reclamo sigue su flujo.
 */
export function RetiroProveedor({ reclamo, puedeRegistrar, onActualizado }: { reclamo: Reclamo; puedeRegistrar: boolean; onActualizado: (r: Reclamo) => void }) {
  const avisos = useAvisos();
  const registrado = Boolean(reclamo.RetiroProveedorFecha);
  const [confirmado, setConfirmado] = useState(false);
  const [fecha, setFecha] = useState(hoyIso());
  const [foto, setFoto] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);

  // La vista previa de la foto elegida se libera al cambiarla o al salir.
  useEffect(() => {
    if (!foto) return setVista(null);
    const url = URL.createObjectURL(foto);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const elegirFoto = async (archivo: File | null) => {
    setError(null);
    if (!archivo) return setFoto(null);
    if (!TIPOS_FOTO.includes(archivo.type)) return setError('La foto debe ser JPG, PNG o WEBP.');
    // Una foto de celular pesa mucho: se achica antes de subirla.
    setProcesando(true);
    try {
      setFoto(await comprimirImagen(archivo));
    } finally {
      setProcesando(false);
    }
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmado) return setError('Marca el check para confirmar que el proveedor ya retiró el producto.');
    if (!foto) return setError('Adjunta la foto del retiro.');
    if (!fecha) return setError('Indica el día del retiro.');
    setGuardando(true);
    setError(null);
    try {
      const r = await apiReclamos.registrarRetiro(reclamo.Token, fecha, foto);
      onActualizado(r);
      avisos.ok(`Retiro del proveedor registrado en ${reclamo.Numero}.`);
      setConfirmado(false);
      setFoto(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el retiro.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className={cn('flex flex-col gap-4', registrado && 'ring-2 ring-success/30')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Truck size={18} className={registrado ? 'text-success' : 'text-brand-600 dark:text-brand-400'} aria-hidden /> Retiro del proveedor
        </h2>
        {registrado ? (
          <span className="badge-pill border border-success/30 bg-success/15 text-success">
            <CheckCircle2 size={13} className="anim-check" aria-hidden /> Retirado el {formatFechaCorta(reclamo.RetiroProveedorFecha ?? null)}
          </span>
        ) : (
          <span className="badge-pill border border-black/10 bg-black/5 dark:border-white/15 dark:bg-white/10">Retiro pendiente</span>
        )}
      </div>

      {registrado ? (
        <div className="anim-aparecer flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-full max-w-60 shrink-0 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            {/* ?v=: si se corrige el retiro con otra foto, se vuelve a bajar en vez de mostrar la anterior. */}
            <AuthImage path={`${apiReclamos.fotoRetiroPath(reclamo.Token)}?v=${encodeURIComponent(reclamo.RetiroProveedorRegistradoAt || '')}`} alt="Foto del retiro del producto" className="aspect-[4/3] h-auto w-full object-cover" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
            <p>
              El proveedor retiró el producto el <strong className="font-semibold">{formatFechaCorta(reclamo.RetiroProveedorFecha ?? null)}</strong>.
            </p>
            <p className="opacity-65">
              Registrado por {reclamo.RetiroProveedorPorNombre || reclamo.RetiroProveedorPor}
              {reclamo.RetiroProveedorRegistradoAt && ` el ${formatFecha(reclamo.RetiroProveedorRegistradoAt)}`}
            </p>
            <p className="text-xs opacity-55">Es solo una constancia: el reclamo sigue su flujo normal.</p>
            {puedeRegistrar && (
              <Button variant="ghost" className="self-start text-danger" onClick={() => setQuitar(true)}>
                <X size={15} /> Quitar la marca
              </Button>
            )}
          </div>
        </div>
      ) : puedeRegistrar ? (
        <form onSubmit={registrar} className="flex flex-col gap-4">
          <p className="text-sm opacity-70">Cuando el proveedor venga a llevarse el producto, márcalo aquí con la foto y el día. El reclamo sigue su flujo normal.</p>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-sm font-semibold transition-colors hover:bg-brand-500/5 has-[:checked]:border-brand-500/40 has-[:checked]:bg-brand-500/[0.06] dark:border-white/10">
            <input type="checkbox" className="size-5 accent-brand-500" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
            El proveedor ya retiró el producto
          </label>

          {confirmado && (
            <div className="anim-seccion grid gap-4 sm:grid-cols-2">
              <Field label="Día del retiro">
                <CampoFecha required max={hoyIso()} value={fecha} onChange={setFecha} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Foto del retiro</span>
                {vista ? (
                  <div className="relative w-full max-w-60 overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                    <img src={vista} alt="Foto elegida del retiro" className="aspect-[4/3] w-full object-cover" />
                    <button type="button" onClick={() => setFoto(null)} aria-label="Quitar la foto" className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/55 text-white hover:bg-black/70">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-brand-500/40 px-4 py-3 text-sm transition-colors hover:bg-brand-500/5">
                    <span className="chip-icono text-brand-600 dark:text-brand-400">{procesando ? <Camera size={16} className="animate-pulse" /> : <ImagePlus size={16} />}</span>
                    <span>
                      <span className="block font-semibold">{procesando ? 'Preparando la foto…' : 'Toca para tomar o elegir la foto'}</span>
                      <span className="block text-xs opacity-60">JPG, PNG o WEBP</span>
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => elegirFoto(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>
            </div>
          )}

          {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

          {confirmado && (
            <div className="flex justify-end">
              <Button type="submit" estado={guardando ? 'cargando' : null} disabled={procesando}>
                <Truck size={15} /> {guardando ? 'Registrando…' : 'Registrar retiro'}
              </Button>
            </div>
          )}
        </form>
      ) : (
        <p className="text-sm opacity-65">Gof marca aquí cuando el proveedor retire el producto, con la foto y el día.</p>
      )}

      {quitar && (
        <ConfirmModal
          titulo="Quitar la marca de retiro"
          textoConfirmar="Quitar la marca"
          onClose={() => setQuitar(false)}
          onConfirm={async () => {
            const r = await apiReclamos.quitarRetiro(reclamo.Token);
            onActualizado(r);
            avisos.ok(`Se quitó la marca de retiro de ${reclamo.Numero}.`);
            setQuitar(false);
          }}
        >
          Se borra la marca de que el proveedor retiró el producto y su foto. Úsalo si se registró por error.
        </ConfirmModal>
      )}
    </GlassCard>
  );
}
