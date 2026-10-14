import { useState } from 'react';
import type React from 'react';
import { Eye, FileSpreadsheet, FileText, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ApiError, guardarBlob } from '../../../api/client';
import * as apiProductosDanados from '../../../api/productosDanados';
import { formatFecha } from '../../../lib/formatters';
import { useLimites } from '../../../auth/useLimites';
import type { AdjuntoReporte, ReporteDetalle } from '../../../types/productoDanado';
import { ExcelPreviewModal, PdfPreviewModal } from '../../reclamos/components/VisoresLazy';
import { ConfirmModal } from '../../reclamos/components/ConfirmModal';


/**
 * Adjuntos del reporte (PDF o Excel). Sin `etapa`: los que acompañan el correo
 * al proveedor. `etapa="gof"`: los documentos que Gof envía a contabilidad.
 * Ambos viven en el mismo arreglo; el índice es la posición en ese arreglo.
 */
export function AdjuntosReporte({
  reporte,
  editable,
  onActualizado,
  etapa,
}: {
  reporte: ReporteDetalle;
  editable: boolean;
  onActualizado: (r: ReporteDetalle) => void;
  etapa?: 'gof';
}) {
  const [vista, setVista] = useState<{ idx: number; adj: AdjuntoReporte } | null>(null);
  const [aEliminar, setAEliminar] = useState<{ idx: number; adj: AdjuntoReporte } | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { adjuntoMb: ADJUNTO_MAX_MB, correoMb } = useLimites();
  const id = reporte.ReporteId;
  const esGof = etapa === 'gof';
  const lista = reporte.Adjuntos.map((adj, idx) => ({ adj, idx })).filter(({ adj }) => (adj.etapa === 'gof') === esGof);
  const subir = esGof ? apiProductosDanados.subirDocumentoGof : apiProductosDanados.subirAdjunto;

  const descargar = async (idx: number, adj: AdjuntoReporte) => guardarBlob(await apiProductosDanados.descargarAdjunto(id, idx), adj.originalname);

  const handleSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setError(null);
    const fallidos: string[] = [];
    // Los que pasan el límite ni se intentan: el backend los rechazaría después de subirlos completos.
    const grandes = files.filter((f) => f.size > ADJUNTO_MAX_MB * 1024 * 1024);
    for (const f of grandes) fallidos.push(`${f.name}: pesa ${(f.size / 1024 / 1024).toFixed(1)} MB (máximo ${ADJUNTO_MAX_MB} MB)`);
    const aSubir = files.filter((f) => !grandes.includes(f));
    for (const [i, f] of aSubir.entries()) {
      setSubiendo(`Subiendo ${i + 1} de ${aSubir.length}…`);
      try {
        onActualizado(await subir(id, f));
      } catch (err) {
        fallidos.push(`${f.name}: ${err instanceof ApiError ? err.message : 'error'}`);
      }
    }
    setSubiendo(null);
    if (fallidos.length) setError(`No se pudieron subir: ${fallidos.join(' · ')}`);
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium opacity-70">
        <Paperclip size={14} /> {esGof ? 'Documentos para contabilidad (PDF o Excel)' : 'Adjuntos para el proveedor (PDF o Excel)'}
      </h3>
      {lista.length === 0 && <p className="text-sm opacity-60">{esGof ? 'Gof todavía no ha subido documentos.' : 'Sin adjuntos todavía.'}</p>}
      {lista.map(({ adj, idx }) => (
        <div key={adj.filename} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-black/10 px-3 py-2 text-sm sm:flex-nowrap dark:border-white/10">
          {adj.tipo === 'pdf' ? <FileText size={16} className="shrink-0 text-danger" /> : <FileSpreadsheet size={16} className="shrink-0 text-success" />}
          <span className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-auto">
            <span className="block truncate" title={adj.originalname}>{adj.originalname}</span>
            <span className="block text-xs opacity-50">
              {adj.uploaded_by_nombre || adj.uploaded_by} · {formatFecha(adj.uploaded_at)}
            </span>
          </span>
          <Button variant="ghost" className="ml-auto px-2 py-1 text-xs sm:ml-0" onClick={() => setVista({ idx, adj })}>
            <Eye size={14} /> Ver
          </Button>
          {editable && (
            <Button variant="ghost" className="px-2 py-1 text-xs text-danger" onClick={() => setAEliminar({ idx, adj })}>
              <Trash2 size={14} /> Eliminar
            </Button>
          )}
        </div>
      ))}
      {error && <p className="text-xs text-danger">{error}</p>}
      {editable && (
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-black/20 px-4 py-2 text-sm hover:border-brand-500/50 dark:border-white/20">
          <Paperclip size={15} className="opacity-60" />
          {subiendo || (esGof ? 'Subir documento (PDF o Excel)' : 'Agregar archivo (PDF o Excel)')}
          <input type="file" multiple accept=".xlsx,.xls,.pdf,application/pdf" className="hidden" disabled={Boolean(subiendo)} onChange={handleSubir} />
        </label>
      )}
      {editable && (
        <p className="text-xs opacity-50">
          Máximo {ADJUNTO_MAX_MB} MB por archivo.
          {!esGof && ` El correo al proveedor admite hasta ${correoMb} MB en total (adjuntos y foto).`}
        </p>
      )}

      {vista &&
        (vista.adj.tipo === 'pdf' ? (
          <PdfPreviewModal
            titulo={vista.adj.originalname}
            cargar={() => apiProductosDanados.descargarAdjunto(id, vista.idx)}
            onDescargar={() => descargar(vista.idx, vista.adj)}
            onClose={() => setVista(null)}
          />
        ) : (
          <ExcelPreviewModal
            titulo={vista.adj.originalname}
            cargar={async () => (await apiProductosDanados.descargarAdjunto(id, vista.idx)).arrayBuffer()}
            onDescargar={() => descargar(vista.idx, vista.adj)}
            onClose={() => setVista(null)}
          />
        ))}

      {aEliminar && (
        <ConfirmModal
          titulo="Eliminar adjunto"
          textoConfirmar="Eliminar"
          onClose={() => setAEliminar(null)}
          onConfirm={async () => {
            onActualizado(await apiProductosDanados.eliminarAdjunto(id, aEliminar.idx));
            setAEliminar(null);
          }}
        >
          ¿Eliminar <strong>{aEliminar.adj.originalname}</strong>? No se puede deshacer.
        </ConfirmModal>
      )}
    </section>
  );
}
