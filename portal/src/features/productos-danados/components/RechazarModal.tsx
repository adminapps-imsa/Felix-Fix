import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Field, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';

/** Textos del modal: por defecto, marcar como NF. */
interface TextosMotivo {
  titulo: string;
  texto: string;
  label: string;
  confirmar: string;
  /** Mensaje si el texto es muy corto. */
  corto: string;
  /** Mensaje si falla sin un error del servidor. */
  fallo: string;
  maxLength: number;
  variante: 'danger' | 'primary';
}

const NF: TextosMotivo = {
  titulo: 'Marcar como NF',
  texto: 'El reporte pasará al supervisor GOF.',
  label: 'Motivo del NF (obligatorio)',
  confirmar: 'Confirmar NF',
  corto: 'El motivo del NF debe tener al menos 5 caracteres.',
  fallo: 'No se pudo marcar el reporte como NF.',
  maxLength: 500,
  variante: 'danger',
};

/** Devolver a la tienda: lo que tiene que corregir. */
export const DEVOLVER_TIENDA: TextosMotivo = {
  titulo: 'Devolver a la tienda',
  texto: 'La tienda recibe un correo con tu comentario, corrige el formulario y te lo reenvía. Mientras tanto no se puede enviar al proveedor.',
  label: 'Qué tiene que corregir (obligatorio)',
  confirmar: 'Devolver a la tienda',
  corto: 'Escribe qué tiene que corregir la tienda (al menos 5 caracteres).',
  fallo: 'No se pudo devolver el reporte a la tienda.',
  maxLength: 1000,
  variante: 'primary',
};

export function RechazarModal({
  onClose,
  onConfirm,
  textos = NF,
}: {
  onClose: () => void;
  onConfirm: (motivo: string) => Promise<void>;
  textos?: TextosMotivo;
}) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo.trim().length < 5) {
      setError(textos.corto);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : textos.fallo);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={textos.titulo} onClose={onClose} layer="z-[60]" dismissible={false}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <p className="text-sm opacity-70">{textos.texto}</p>
        <Field label={textos.label}>
          <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={textos.maxLength} required />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant={textos.variante} estado={saving ? 'cargando' : null}>
            {saving ? 'Guardando…' : textos.confirmar}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
