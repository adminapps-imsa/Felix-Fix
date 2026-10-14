import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

/** Vista previa de PDF sobre un blob URL (local o descargado con auth). */
export function PdfPreviewModal({
  titulo,
  cargar,
  onDescargar,
  onClose,
}: {
  titulo: string;
  cargar: () => Promise<Blob>;
  onDescargar?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);
  const descargar = () => {
    setErrorDescarga(null);
    Promise.resolve()
      .then(() => onDescargar?.())
      .catch((err) => setErrorDescarga(err instanceof Error ? err.message : 'No se pudo descargar el archivo.'));
  };

  useEffect(() => {
    let u: string | null = null;
    let cancelado = false;
    cargar()
      .then((blob) => {
        if (cancelado) return;
        u = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        setUrl(u);
      })
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
      if (u) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal
      title={titulo}
      onClose={onClose}
      size="xl"
      layer="z-[60]"
      actions={
        onDescargar && (
          <Button variant="secondary" className="px-3 py-1.5" onClick={descargar}>
            <Download size={14} /> Descargar
          </Button>
        )
      }
    >
      {errorDescarga && <p className="mb-3 text-sm text-danger">{errorDescarga}</p>}
      {error && <p className="text-sm text-danger">No se pudo cargar el PDF.</p>}
      {!url && !error && <p className="text-sm opacity-60">Cargando PDF…</p>}
      {url && <iframe src={url} title={titulo} className="h-[70vh] w-full rounded-xl border border-black/10 bg-white dark:border-white/10" />}
    </Modal>
  );
}
