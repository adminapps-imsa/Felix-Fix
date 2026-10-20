import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

/**
 * Cierre de una etapa: "Validar NF" (supervisor GOF, documento salida de NF
 * obligatorio) o "Pago recibido" (contabilidad, referencia obligatoria), con
 * comentario opcional.
 */
export function CierreModal({
  titulo,
  texto,
  campo,
  textoConfirmar,
  onClose,
  onConfirm,
}: {
  titulo: string;
  texto: React.ReactNode;
  /** Dato obligatorio (se entrega en `referencia`). */
  campo?: { label: string; placeholder?: string; error: string; mono?: boolean };
  textoConfirmar: string;
  onClose: () => void;
  onConfirm: (datos: { referencia: string; comentario: string }) => Promise<void>;
}) {
  const [referencia, setReferencia] = useState('');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (campo && !referencia.trim()) {
      setError(campo.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ referencia: referencia.trim(), comentario: comentario.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={titulo} onClose={onClose} layer="z-[60]" dismissible={false}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
        <div>{texto}</div>
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        {campo && (
          <Field label={campo.label}>
            <Input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={200}
              placeholder={campo.placeholder}
              className={campo.mono ? 'font-mono' : undefined}
              autoFocus
            />
          </Field>
        )}
        <Field label="Comentario (opcional)">
          <Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" estado={saving ? 'cargando' : null}>
            {saving ? 'Guardando…' : textoConfirmar}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
