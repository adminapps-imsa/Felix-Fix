import React, { Suspense } from 'react';
import { lazyConRecarga } from '../../../lib/lazyConRecarga';
import { Modal } from '../../../components/ui/Modal';

// Los visores se cargan recién al abrirlos: el de Excel arrastra la librería
// xlsx (~375 KB) y no tiene sentido descargarla cada vez que se entra a Reclamos.
const ExcelPreviewModalLazy = lazyConRecarga(() => import('./ExcelPreviewModal').then((m) => ({ default: m.ExcelPreviewModal })));
const PdfPreviewModalLazy = lazyConRecarga(() => import('./PdfPreviewModal').then((m) => ({ default: m.PdfPreviewModal })));

function Cargando({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Cargando vista previa…" onClose={onClose} layer="z-[60]">
      <p className="text-sm opacity-60">Un momento…</p>
    </Modal>
  );
}

export function ExcelPreviewModal(props: React.ComponentProps<typeof ExcelPreviewModalLazy>) {
  return (
    <Suspense fallback={<Cargando onClose={props.onClose} />}>
      <ExcelPreviewModalLazy {...props} />
    </Suspense>
  );
}

export function PdfPreviewModal(props: React.ComponentProps<typeof PdfPreviewModalLazy>) {
  return (
    <Suspense fallback={<Cargando onClose={props.onClose} />}>
      <PdfPreviewModalLazy {...props} />
    </Suspense>
  );
}
