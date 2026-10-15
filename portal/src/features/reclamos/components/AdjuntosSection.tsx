import { useState } from 'react';
import type React from 'react';
import { AlertTriangle, Download, Eye, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { GlassCard } from '../../../components/ui/GlassCard';
import { Button } from '../../../components/ui/Button';
import { ApiError, guardarBlob } from '../../../api/client';
import * as apiReclamos from '../../../api/reclamos';
import { formatFecha } from '../../../lib/formatters';
import { useLimites } from '../../../auth/useLimites';
import type { AdjuntoExtra, Reclamo } from '../../../types/reclamo';
import { ExcelPreviewModal, PdfPreviewModal } from './VisoresLazy';
import type { FotoDeHoja } from './ExcelPreviewModal';
import { ConfirmModal } from './ConfirmModal';
import { ImagenPreviewModal } from './ImagenPreviewModal';

const ORIGEN_PRINCIPAL = 'principal';

/** "Título (documento X). Detalle…" -> la primera frase en grande y el resto debajo. */
function separarMotivo(mensaje: string) {
  const m = mensaje.match(/^(.+?\.)\s+(.+)$/s);
  return m ? { titulo: m[1], detalle: m[2] } : { titulo: mensaje, detalle: null };
}

type Vista = { kind: 'principal' } | { kind: 'adjunto'; idx: number; adj: AdjuntoExtra };

/**
 * Adjuntos unificados: Excel principal + adjuntos extra (Excel/PDF). Las
 * fotos que se muestran en cada vista previa son SOLO las de ese archivo
 * (filtradas por `origen`), nunca mezcladas con las de otros adjuntos.
 */
export function AdjuntosSection({
  reclamo,
  esAdmin,
  puedeAdjuntar,
  onActualizado,
}: {
  reclamo: Reclamo;
  esAdmin: boolean;
  puedeAdjuntar: boolean;
  onActualizado: (r: Reclamo) => void;
}) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [aEliminar, setAEliminar] = useState<{ idx: number; adj: AdjuntoExtra } | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Archivos que no se pudieron subir (p. ej. una nota de débito con productos rechazados): se avisan en un popup.
  const [rechazos, setRechazos] = useState<{ nombre: string; titulo: string; detalle: string | null }[]>([]);
  const { adjuntoMb: ADJUNTO_MAX_MB } = useLimites();
  const token = reclamo.Token;

  const fotosDe = (origen: string): FotoDeHoja[] =>
    reclamo.ImagenesExcel.map((img, idx) => ({ img, idx }))
      .filter(({ img }) => img.origen === origen)
      .map(({ img, idx }) => ({ path: apiReclamos.imagenPath(token, idx), sheet: img.sheet, sheetName: img.sheetName }));

  const nombreExcel = reclamo.ArchivoExcelNombre || `${reclamo.Numero}.xlsx`;
  const descargarPrincipal = async () => guardarBlob(await apiReclamos.descargarExcel(token), nombreExcel);
  // Botón "Descargar" de la lista: el error se muestra aquí (en los visores lo muestra el propio modal).
  const descargarPrincipalConAviso = () => {
    setError(null);
    descargarPrincipal().catch((err) => setError(err instanceof Error ? err.message : 'No se pudo descargar el archivo.'));
  };
  const descargarAdjunto = async (idx: number, adj: AdjuntoExtra) =>
    guardarBlob(await apiReclamos.descargarAdjunto(token, idx), adj.originalname);

  const handleSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    setError(null);
    setRechazos([]);
    const fallidos: { nombre: string; titulo: string; detalle: string | null }[] = [];
    const grandes = files.filter((f) => f.size > ADJUNTO_MAX_MB * 1024 * 1024);
    for (const f of grandes) fallidos.push({ nombre: f.name, titulo: `Pesa ${(f.size / 1024 / 1024).toFixed(1)} MB (máximo ${ADJUNTO_MAX_MB} MB).`, detalle: null });
    const aSubir = files.filter((f) => !grandes.includes(f));
    for (const [i, f] of aSubir.entries()) {
      setSubiendo(`Subiendo ${i + 1} de ${aSubir.length}…`);
      try {
        onActualizado(await apiReclamos.subirAdjunto(token, f));
      } catch (err) {
        fallidos.push({ nombre: f.name, ...separarMotivo(err instanceof ApiError ? err.message : 'No se pudo subir el archivo.') });
      }
    }
    setSubiendo(null);
    setRechazos(fallidos);
  };

  const fotosPrincipal = fotosDe(ORIGEN_PRINCIPAL).length;

  return (
    <GlassCard className="flex flex-col gap-4">
      <h2 className="text-base font-bold">Adjuntos</h2>

      <div className="flex flex-col gap-1.5">
        <span className="etiqueta">Excel del reclamo</span>
        {!reclamo.TieneExcel ? (
          <p className="text-sm opacity-60">Sin Excel: los productos se llenaron a mano en el formulario.</p>
        ) : (
        <div className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
          <FileSpreadsheet size={16} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1 truncate">{nombreExcel}</span>
          {fotosPrincipal > 0 && <span className="shrink-0 text-xs opacity-60">{fotosPrincipal} foto(s)</span>}
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setVista({ kind: 'principal' })}>
            <Eye size={14} /> Ver
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={descargarPrincipalConAviso}>
            <Download size={14} /> Descargar
          </Button>
        </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="etiqueta">Fotos y adjuntos del reclamo (fotos, PDF o Excel)</span>
        {reclamo.AdjuntosExtra.length === 0 && <p className="text-sm opacity-60">Sin archivos adicionales.</p>}
        {reclamo.AdjuntosExtra.map((adj, idx) => {
          const nFotos = fotosDe(adj.filename).length;
          return (
            <div key={adj.filename} className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              {adj.tipo === 'imagen' ? (
                <ImageIcon size={16} className="shrink-0 text-brand-600 dark:text-brand-400" />
              ) : adj.tipo === 'pdf' ? (
                <FileText size={16} className="shrink-0 text-brand-600 dark:text-brand-400" />
              ) : (
                <FileSpreadsheet size={16} className="shrink-0 text-success" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {adj.tipo === 'pdf' && (
                    <span className="mr-1.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400">PDF del reclamo</span>
                  )}
                  {adj.notaAprobada && (
                    <span className="mr-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold text-success">Validado con lo aprobado</span>
                  )}
                  {adj.originalname}
                </span>
                <span className="block text-xs opacity-50">
                  {adj.uploaded_by_nombre || adj.uploaded_by} · {formatFecha(adj.uploaded_at)}
                  {nFotos > 0 && ` · ${nFotos} foto(s)`}
                </span>
              </span>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setVista({ kind: 'adjunto', idx, adj })}>
                <Eye size={14} /> Ver
              </Button>
              {esAdmin && (
                <Button variant="ghost" className="px-2 py-1 text-xs text-danger" onClick={() => setAEliminar({ idx, adj })}>
                  <Trash2 size={14} /> Eliminar
                </Button>
              )}
            </div>
          );
        })}
        {/* Archivos rechazados: se muestran en la lista, donde iría el documento, con el motivo. */}
        {rechazos.map((r, i) => (
          <div
            key={`${r.nombre}-${i}`}
            role="alert"
            className="anim-aparecer flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm"
          >
            {/\.pdf$/i.test(r.nombre) ? <FileText size={16} className="mt-0.5 shrink-0 text-danger" /> : <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-danger" />}
            <span className="min-w-0 flex-1 break-words">
              <span className="block truncate font-semibold">{r.nombre}</span>
              <span className="flex items-start gap-1 font-semibold text-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {r.titulo}
              </span>
              {r.detalle && <span className="block text-xs opacity-75">{r.detalle}</span>}
              <span className="block text-xs opacity-60">No se adjuntó.</span>
            </span>
            <button
              type="button"
              aria-label="Quitar aviso"
              className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => setRechazos((list) => list.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {error && <p className="text-xs text-danger">{error}</p>}
        {puedeAdjuntar && (
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-dashed border-black/20 px-4 py-2 text-sm hover:border-brand-500/50 dark:border-white/20">
            <Paperclip size={15} className="opacity-60" />
            {subiendo || 'Agregar fotos o archivos (fotos, Excel o PDF)'}
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.pdf,application/pdf" className="hidden" disabled={Boolean(subiendo)} onChange={handleSubir} />
          </label>
        )}
      </div>

      {vista?.kind === 'principal' && (
        <ExcelPreviewModal
          titulo={nombreExcel}
          cargar={async () => (await apiReclamos.descargarExcel(token)).arrayBuffer()}
          fotos={fotosDe(ORIGEN_PRINCIPAL)}
          onDescargar={descargarPrincipal}
          onClose={() => setVista(null)}
        />
      )}
      {vista?.kind === 'adjunto' &&
        (vista.adj.tipo === 'imagen' ? (
          <ImagenPreviewModal
            titulo={vista.adj.originalname}
            cargar={() => apiReclamos.descargarAdjunto(token, vista.idx)}
            onDescargar={() => descargarAdjunto(vista.idx, vista.adj)}
            onClose={() => setVista(null)}
          />
        ) : vista.adj.tipo === 'pdf' ? (
          <PdfPreviewModal
            titulo={vista.adj.originalname}
            cargar={() => apiReclamos.descargarAdjunto(token, vista.idx)}
            onDescargar={() => descargarAdjunto(vista.idx, vista.adj)}
            onClose={() => setVista(null)}
          />
        ) : (
          <ExcelPreviewModal
            titulo={vista.adj.originalname}
            cargar={async () => (await apiReclamos.descargarAdjunto(token, vista.idx)).arrayBuffer()}
            fotos={fotosDe(vista.adj.filename)}
            onDescargar={() => descargarAdjunto(vista.idx, vista.adj)}
            onClose={() => setVista(null)}
          />
        ))}

      {aEliminar && (
        <ConfirmModal
          titulo="Eliminar adjunto"
          textoConfirmar="Eliminar"
          onClose={() => setAEliminar(null)}
          onConfirm={async () => {
            onActualizado(await apiReclamos.eliminarAdjunto(token, aEliminar.idx));
            setAEliminar(null);
          }}
        >
          ¿Eliminar <strong>{aEliminar.adj.originalname}</strong>? También se borran sus fotos. No se puede deshacer.
        </ConfirmModal>
      )}
    </GlassCard>
  );
}
