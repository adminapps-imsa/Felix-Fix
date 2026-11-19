import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Textarea } from '../../../components/ui/Input';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import type { Reclamo } from '../../../types/reclamo';
import { STATUS_LABEL } from '../lib/tipos';

/**
 * Torre de Control (permiso «Editar reclamos de CEDI», 2026-11-19): si subió o
 * escribió algo mal en un CEDI ya creado, lo abre para editar. Queda «En
 * edición», corrige datos, Excel y adjuntos con la tarjeta de corrección, y al
 * «Guardar cambios» vuelve al estado que tenía. No se avisa a nadie al abrirlo.
 */
export function EditarReclamoCedi({ reclamo, onAbierto }: { reclamo: Reclamo; onAbierto: (r: Reclamo) => void }) {
  const [abrir, setAbrir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avisos = useAvisos();

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAbierto(await apiReclamos.abrirEdicion(reclamo.Token, motivo.trim()));
      avisos.ok(`${reclamo.Numero} abierto para editar.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el reclamo para editar.');
      setBusy(false);
    }
  };

  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm opacity-80">¿Se subió o se escribió algo mal? Mientras la compradora no lo decida, puedes abrirlo para editar los datos, el Excel o los adjuntos.</p>
      <Button variant="secondary" onClick={() => setAbrir(true)}>
        <Pencil size={15} /> Editar reclamo
      </Button>
      {abrir && (
        <Modal title={`Editar ${reclamo.Numero}`} onClose={() => !busy && setAbrir(false)}>
          <form onSubmit={confirmar} className="flex flex-col gap-4 text-sm">
            <p>
              El reclamo queda <strong className="font-semibold">En edición</strong>: mientras tanto no se pueden decidir sus productos. Corriges lo que haga
              falta y pulsas «Guardar cambios»: vuelve a «{STATUS_LABEL[reclamo.Status]}», como está ahora. Si se había cerrado solo y cambias productos que
              la compradora tiene que decidir, pasa a ella como pendiente.
            </p>
            <Field label="¿Qué vas a corregir?" opcional>
              <Textarea rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. subí el PDF equivocado." />
            </Field>
            {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setAbrir(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" estado={busy ? 'cargando' : null}>
                <Pencil size={15} /> Abrir para editar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </GlassCard>
  );
}
