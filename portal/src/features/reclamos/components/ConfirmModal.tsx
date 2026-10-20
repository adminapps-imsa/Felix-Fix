import { useState } from 'react';
import type React from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

export function ConfirmModal({
  titulo,
  children,
  textoConfirmar,
  onConfirm,
  onClose,
}: {
  titulo: string;
  children: React.ReactNode;
  textoConfirmar: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={titulo} onClose={onClose} layer="z-[60]">
      <div className="flex flex-col gap-4 text-sm">
        <div>{children}</div>
        {error && <div className="anim-aparecer rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-danger">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            estado={busy ? 'cargando' : null}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
                setBusy(false);
              }
            }}
          >
            {busy ? 'Procesando…' : textoConfirmar}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
