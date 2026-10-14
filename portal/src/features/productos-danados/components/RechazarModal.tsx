import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Field, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

export function RechazarModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length < 5) {
      setError('El motivo del NF debe tener al menos 5 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar el reporte como NF.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Marcar como NF" onClose={onClose} layer="z-[60]" dismissible={false}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <p className="text-sm opacity-70">El reporte pasará al supervisor GOF.</p>
        <Field label="Motivo del NF (obligatorio)">
          <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" disabled={saving}>
            {saving ? 'Guardando…' : 'Confirmar NF'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
