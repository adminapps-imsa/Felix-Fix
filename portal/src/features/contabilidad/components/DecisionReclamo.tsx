import { useState } from 'react';
import { Ban, Gavel, Undo2 } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { Field, Textarea } from '../../../components/ui/Input';
import { useAvisos } from '../../../components/ui/Avisos';
import { ApiError } from '../../../api/client';
import * as apiContabilidad from '../../../api/contabilidad';
import { formatFecha } from '../../../lib/formatters';
import { cn } from '../../../lib/cn';
import type { DecisionContabilidad, DocumentoContabilidadDetalle } from '../../../types/contabilidad';
import { ConfirmModal } from '../../reclamos/components/ConfirmModal';

const OPCIONES: Array<{ id: DecisionContabilidad; titulo: string; detalle: string }> = [
  { id: 'reclamar', titulo: 'Reclamar', detalle: 'Se le reclama al proveedor: envías la nota de débito y registras su respuesta.' },
  { id: 'no_reclamar', titulo: 'No reclamar', detalle: 'No se le reclama: escribe el motivo y el documento queda cerrado.' },
];

/**
 * Primero contabilidad decide si el documento se le reclama al proveedor
 * (2026-11-18). Con «Reclamar» aparecen «Enviar al proveedor» y «Respuesta del
 * proveedor»; con «No reclamar» (y su motivo) el documento queda cerrado.
 */
export function DecisionReclamo({ doc, onActualizado }: { doc: DocumentoContabilidadDetalle; onActualizado: (d: DocumentoContabilidadDetalle) => void }) {
  const avisos = useAvisos();
  const [decision, setDecision] = useState<DecisionContabilidad | null>(null);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState(false);
  const d = doc.Decision;

  if (d) {
    const reclamar = d.decision === 'reclamar';
    // Ya enviado al proveedor o con respuesta: la decisión queda fija (el backend responde 409).
    const fija = Boolean(doc.EnvioProveedor) || Boolean(doc.Respuesta);
    return (
      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className={cn('flex items-center gap-2 text-base font-bold', reclamar ? 'text-brand-600 dark:text-brand-400' : 'text-warning')}>
              {reclamar ? <Gavel size={17} /> : <Ban size={17} />} {reclamar ? 'Se reclama al proveedor' : 'No se reclama al proveedor'}
            </span>
            <span className="text-xs opacity-70">
              Decidido el {d.at ? formatFecha(d.at) : '—'}
              {d.porNombre && <> por {d.porNombre}</>}
            </span>
            {d.comentario && <span className="whitespace-pre-line">Motivo: {d.comentario}</span>}
          </div>
          {!fija && (
            <Button variant="secondary" onClick={() => setQuitar(true)}>
              <Undo2 size={15} /> Cambiar decisión
            </Button>
          )}
        </div>
        {quitar && (
          <ConfirmModal
            titulo="Cambiar la decisión"
            textoConfirmar="Quitar la decisión"
            onClose={() => setQuitar(false)}
            onConfirm={async () => {
              onActualizado(await apiContabilidad.quitarDecision(doc.DocumentoId));
              avisos.ok('Se quitó la decisión; el documento vuelve a pendiente.');
              setQuitar(false);
            }}
          >
            Se quita la decisión y el documento vuelve a quedar pendiente para decidir de nuevo.
          </ConfirmModal>
        )}
      </GlassCard>
    );
  }

  const guardar = async () => {
    if (!decision) return setError('Elige si se reclama o no al proveedor.');
    if (decision === 'no_reclamar' && !comentario.trim()) return setError('Escribe por qué no se reclama.');
    setGuardando(true);
    setError(null);
    try {
      onActualizado(await apiContabilidad.decidirReclamo(doc.DocumentoId, decision, decision === 'no_reclamar' ? comentario.trim() : ''));
      avisos.ok(decision === 'reclamar' ? 'Se reclama al proveedor: ya puedes enviarle el documento.' : 'Documento cerrado: no se reclama al proveedor.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Gavel size={17} /> ¿Se reclama al proveedor?
        </h2>
        <p className="text-sm opacity-70">Decide si este documento se le reclama al proveedor. Si se reclama, podrás enviárselo y registrar su respuesta.</p>
      </div>
      <div role="radiogroup" aria-label="¿Se reclama al proveedor?" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPCIONES.map((o) => {
          const activo = decision === o.id;
          const reclamar = o.id === 'reclamar';
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => {
                setDecision(o.id);
                setError(null);
              }}
              className={cn(
                'flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                activo
                  ? reclamar
                    ? 'border-brand-500/50 bg-brand-500/10'
                    : 'border-warning/50 bg-warning/10'
                  : 'border-black/10 hover:bg-black/[0.03] dark:border-white/10 dark:hover:bg-white/[0.05]'
              )}
            >
              <span className={cn('flex items-center gap-2 font-bold', activo && (reclamar ? 'text-brand-600 dark:text-brand-400' : 'text-warning'))}>
                {reclamar ? <Gavel size={16} /> : <Ban size={16} />} {o.titulo}
              </span>
              <span className="text-xs opacity-70">{o.detalle}</span>
            </button>
          );
        })}
      </div>

      {decision === 'no_reclamar' && (
        <Field label="Motivo">
          <Textarea rows={3} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Por qué no se le reclama al proveedor." />
        </Field>
      )}

      {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {decision && (
        <div className="flex justify-end">
          <Button onClick={guardar} estado={guardando ? 'cargando' : null}>
            {decision === 'reclamar' ? <Gavel size={15} /> : <Ban size={15} />}
            {decision === 'reclamar' ? 'Reclamar al proveedor' : 'No reclamar y cerrar'}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}
